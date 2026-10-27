# Datos en AWS: PostgreSQL, Redis, respaldos y retención (Fase 18)

Guía de la Fase 18 de [`fases-siguientes-3.md`](fases-siguientes-3.md)
(Parte 1). Cubre la base de datos, los respaldos y la retención. El
despliegue general (EC2, TLS, DNS, SES, secretos) es la Fase 19B y va en
`docs/despliegue-aws.md`, de la Parte 2.

Todo lo de aquí ya funciona en local con `docker compose`. **Nada se creó en
AWS**: los pasos de AWS están escritos, pero falta correrlos cuando exista la
cuenta (ver [Pendiente en AWS](#pendiente-en-aws)).

## 1. Migraciones: un solo paso de despliegue

Antes, cada contenedor (`backend-1`, `backend-2`, `worker`) corría `prisma
migrate deploy` al arrancar. Desde la Fase 18 lo hace una sola vez el
servicio `migrar`, que termina, y los demás lo esperan
(`depends_on: service_completed_successfully`):

```bash
npm run migrar   # = prisma migrate deploy && tsx prisma/configurar-rol-app.ts
```

`configurar-rol-app.ts` le pone al rol `comanda_app` (RLS, Fase 12) la
contraseña de `DATABASE_URL_APP`. En la beta lo hace el servicio `migrate`
de `docker-compose.prod.yml` (Fase 17B), con el mismo comando, antes de que
arranquen `backend-1`, `backend-2` y `worker`.

## 2. Seed solo en ambientes de prueba

`prisma/seed.ts` borra todo y crea los datos de demo. Se niega a correr si
`AMBIENTE=produccion`, o si no hay `AMBIENTE` y `NODE_ENV=production`:

| AMBIENTE | ¿Corre el seed? |
|---|---|
| `local` (por defecto) | Sí |
| `beta` | Sí (la beta es la demo) |
| `produccion` | No |

## 3. Respaldo diario y restauración

El contenedor `respaldo` (`postgres/respaldo/`) trae `pg_dump`/`pg_restore`
16 y `aws-cli`. Va en el perfil `respaldo`, así que `docker compose up` no lo
levanta en desarrollo. En la beta, `docker-compose.prod.yml` sí lo levanta
siempre (imagen `comanda-respaldo`, publicada por el workflow de despliegue)
y escribe en `RESPALDO_S3_BUCKET` con el rol de la EC2.

```bash
# Cron diario (RESPALDO_CRON, en UTC; por defecto 08:00 UTC = 03:00 Bogotá)
docker compose --profile respaldo up -d respaldo

# Un respaldo ahora
docker compose run --rm respaldo respaldar

# Restaurar el último respaldo en una base nueva y comparar
docker compose run --rm -e RESTAURAR_DB=comanda_prueba respaldo restaurar
# ...o uno en particular
docker compose run --rm -e RESTAURAR_DB=comanda_prueba respaldo restaurar postgres/comanda-20261026T080000Z.dump
```

- **Destino:** `s3://$RESPALDO_S3_BUCKET/$RESPALDO_S3_PREFIJO/<base>-<fecha UTC>.dump`
  (formato custom de `pg_dump`, comprimido). En local va a MinIO; en AWS, a
  S3 (basta con dejar `S3_ENDPOINT` vacío y que la EC2 tenga el rol de IAM).
- **Seguridad de la restauración:** `restaurar` no escribe sobre la base de
  la app (`POSTGRES_DB`) salvo que se pase `RESTAURAR_SOBRESCRIBIR=si`. Para
  una recuperación real:
  1. Detener backend y worker (`docker compose stop backend-1 backend-2 worker`).
  2. Correr `docker compose run --rm -e RESTAURAR_DB=$POSTGRES_DB -e RESTAURAR_SOBRESCRIBIR=si respaldo restaurar`.
  3. Volver a levantarlos. La réplica de lectura se resincroniza sola por
     streaming.
- **RLS:** el respaldo y la restauración usan `--enable-row-security`. En
  Docker el dueño es superusuario y no la necesita, pero en RDS el usuario
  maestro no lo es y, sin esa opción, `pg_dump` falla con las tablas en
  `FORCE ROW LEVEL SECURITY`.

### Prueba de restauración (hecha el 26/10/2026, en local)

Contra una base aparte (`comanda_r3p1`, con migraciones y seed) y el MinIO
del stack local:

1. `respaldar`: subió un `.dump` de 60 KB a MinIO.
2. `restaurar` con `RESTAURAR_DB=comanda_r3p1_restaurada`: la base nueva
   quedó igual a la original:

   | | Original | Restaurada |
   |---|---|---|
   | Políticas RLS | 30 | 30 |
   | Tablas con FORCE RLS | 15 | 15 |
   | Sedes | 3 | 3 |
   | Movimientos de inventario | 45 | 45 |
   | Última migración | `r3p1_usuario_sede` | `r3p1_usuario_sede` |

3. En la restaurada, `comanda_app` ve 0 sedes sin `app.cadena_id` y 3 con la
   cadena fijada: RLS funciona después de restaurar.
4. `restaurar` con `RESTAURAR_DB` igual a la base de la app se negó (exit 1).
5. El modo programado con `RESPALDO_CRON="* * * * *"` hizo un respaldo por
   minuto.

## 4. Retención: XML fiscales 5 años (§4.2) y respaldos 30 días

```bash
docker compose run --rm respaldo ciclo-de-vida
```

Aplica dos reglas de ciclo de vida (probado contra MinIO):

| Bucket | Prefijo | Se borra a los |
|---|---|---|
| `S3_BUCKET` (documentos) | `DOCUMENTOS_PREFIJO_FISCAL` (`fiscal/`) | 1827 días (5 años con bisiestos) |
| `RESPALDO_S3_BUCKET` | `RESPALDO_S3_PREFIJO/` | `RESPALDO_RETENCION_DIAS` (30) |

- **Prefijo de los XML: hay que pedirlo a la Parte 2.** Hoy el worker guarda
  los XML en `{cadenaId}/{sedeId}/...` (`fiscal/procesador-fiscal.service.ts`),
  en la raíz del bucket, junto a donde irán las imágenes de producto
  (`productos/`, Fase 16B). Para que la regla aplique solo a los XML, la llave
  tiene que empezar por `fiscal/`. Es un cambio de una línea en el código de
  la Parte 2; los XML que ya existen siguen funcionando, porque `urlXml`
  guarda la URI completa.
- **Antes de los 5 años no se borra nada sin querer:** la regla solo borra
  *después*. Para impedir un borrado manual antes de tiempo, AWS tiene S3
  Object Lock (modo *compliance*), que se activa al crear el bucket (TODO
  PRODUCCIÓN).
- **Costo:** en AWS se puede agregar una transición a `GLACIER_IR` a los 90
  días. No va en el script porque MinIO la rechaza si no tiene un *tier*
  configurado.

## 5. Beta: Postgres y Redis en contenedores de la EC2

- **Volúmenes persistentes:** `comanda-postgres-data` y
  `comanda-postgres-replica-data` son volúmenes de Docker en el disco EBS de
  la EC2. No se pierden al recrear contenedores. Se pierden si se destruye la
  instancia, y para eso está el respaldo diario en S3.
- **Redis:** solo guarda colas (BullMQ) y el pub/sub de Socket.IO. Si se
  pierde, los documentos fiscales `PENDIENTE` se re-encolan al arrancar el
  worker (Fase 11B). No necesita respaldo.
- **Permisos del rol de IAM de la EC2 para respaldos:** `s3:PutObject`,
  `s3:GetObject` y `s3:ListBucket` sobre el bucket de respaldos, y
  `s3:PutLifecycleConfiguration` solo para quien aplique el ciclo de vida
  (una vez).

## 6. Producción administrada (opcional): RDS y ElastiCache

Solo si alcanzan los créditos, y por pocos días. La réplica de RDS cobra por
hora: se crea para la demo y se borra después.

| Hoy | En RDS / ElastiCache | Qué cambia |
|---|---|---|
| `postgres` | RDS for PostgreSQL 16 | `DATABASE_URL` y `DATABASE_URL_APP` apuntan al endpoint de RDS |
| `postgres-replica` | Réplica de lectura de RDS | `DATABASE_URL_REPLICA` apunta al endpoint de la réplica; desaparecen `postgres-replica` y `postgres-replica-setup` |
| `redis` | ElastiCache (Redis/Valkey) | `REDIS_URL`/`REDIS_HOST` |
| `respaldo` | Snapshots automáticos de RDS | El contenedor puede seguir como respaldo lógico adicional |

**Revisión de RLS y `comanda_app` en RDS** (RDS no da superusuario):

- `r2p1_rol_app` hace `CREATE ROLE comanda_app`: el usuario maestro de RDS
  tiene `CREATEROLE`. Como lo crea él, en PG16 también puede cambiarle la
  contraseña después (`configurar-rol-app.ts` → `ALTER ROLE ... PASSWORD`).
- `r2p1_rls` crea las políticas `dueno_total` para `current_user`, que en RDS
  es el usuario maestro (el que corre `npm run migrar`). Las migraciones y el
  seed tienen que correr siempre con ese mismo usuario.
- El maestro **no** tiene `BYPASSRLS`. Las consultas del dueño pasan por
  `dueno_total`, y `pg_dump`/`pg_restore` necesitan `--enable-row-security`
  (ya incluido).
- La réplica de RDS es física: trae el rol y las políticas, igual que
  `postgres-replica` hoy.
- `postgres/pg_hba.conf` no aplica en RDS. El acceso se controla con el
  grupo de seguridad (solo desde la EC2) y con `rds.force_ssl`.

## Pendiente en AWS

Nada de esto se puede probar sin la cuenta. Queda por hacer cuando exista:

- [ ] Crear el bucket de respaldos y el de documentos. El de documentos,
      idealmente con Object Lock.
- [ ] Correr `ciclo-de-vida` contra S3 con el rol de la EC2.
- [ ] Levantar el `respaldo` programado en la EC2 y repetir la prueba de
      restauración contra S3.
- [ ] (Opcional) RDS: correr `npm run migrar` contra RDS, la prueba de RLS
      (`test/rls-aislamiento.spec.ts`) y un respaldo y restauración. Borrar la
      réplica al terminar.
