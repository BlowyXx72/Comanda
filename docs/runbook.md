# Runbook de la beta (Fase 21B)

Qué hacer cuando algo falla en la beta de AWS. Cada alarma de
`deploy/cloudwatch/crear-alarmas.sh` avisa por correo y apunta a una sección
de esta página.

**Siempre primero:**

1. Entrar a la instancia: **EC2 → la instancia → Connect → Session Manager**.
   No hay SSH.
2. Ejecutar:

   ```bash
   sudo -iu ec2-user
   cd /opt/comanda
   C="docker compose -f docker-compose.prod.yml -f docker-compose.prod.aws.yml --env-file .env.prod"
   $C ps                      # qué está arriba, qué está unhealthy
   $C logs --tail=100 <servicio>
   ```

**Logs centralizados:** CloudWatch → Log groups → `/comanda/beta`. Hay un
stream por contenedor. Los del backend y el worker están en JSON (desde la
Fase 17B), así que se filtran por campo con Logs Insights:

```
fields @timestamp, context, message
| filter level = "error" or level = "warn"
| sort @timestamp desc
| limit 50
```

## Sin servicio (`comanda-beta-sin-servicio`)

`https://<dominio>/api/health` no responde desde internet.

1. ¿Está viva la instancia? Si no hay Session Manager, ver
   [Instancia caída](#instancia-caída).
2. `$C ps`:
   - si Nginx o los dos backends no están `healthy`, `$C up -d --wait` los
     levanta;
   - si siguen cayendo, el log dice por qué (falta un parámetro de SSM,
     falla una migración...).
3. Si fue un despliegue reciente, volver a la versión anterior (ver
   [Volver a una versión anterior](#volver-a-una-versión-anterior)).
4. `/api/health` devuelve `"postgres": "down"` o `"redis": "down"`: ver las
   secciones de abajo.

Con **un** backend caído el servicio sigue: Nginx manda todo al otro y los
eventos en vivo siguen por Redis (Fase 13B). Se levanta con
`$C up -d --wait backend-1` (o el que sea).

## Instancia caída (`comanda-beta-instancia-caida`)

La EC2 falla sus chequeos de estado.

1. **EC2 → Instance state → Reboot.** Al volver, Docker levanta todo solo
   (`restart: unless-stopped`).
2. Si no vuelve: **Stop** y luego **Start**. Así cambia de host físico. La
   Elastic IP se mantiene, y los volúmenes de Postgres, Redis y los
   certificados también.
3. Si la instancia se perdió: crear otra con `docs/despliegue-aws.md` (pasos 6
   y 7) y restaurar la base desde el último respaldo (ver
   [Restaurar la base](#restaurar-la-base-desde-un-respaldo)).

## Disco lleno (`comanda-beta-disco-lleno`)

```bash
df -h /
docker system df
docker image prune -af       # imágenes viejas de despliegues anteriores
docker builder prune -af
```

Los logs de los contenedores ya no ocupan disco, porque van a CloudWatch. Si
lo que crece es la base, ampliar el volumen EBS: **EC2 → Volumes → Modify**,
y luego `sudo growpart` y `sudo xfs_growfs /`.

## Memoria alta (`comanda-beta-memoria-alta`) o CPU alta (`comanda-beta-cpu-alta`)

- `docker stats --no-stream` muestra qué contenedor consume.
- Si es una carga real (Fase 19, pruebas de carga), anotar el dato para el
  informe de dimensionamiento.
- Si no, revisar los logs del contenedor.
- Salida rápida: subir el tipo de instancia (`t3.small` → `t3.medium`),
  deteniéndola primero. Cuesta más créditos por hora.

## Cola fiscal atascada (`comanda-beta-cola-fiscal-atascada`)

Hay documentos fiscales en `PENDIENTE` hace más de 5 minutos, **o el worker
dejó de publicar la métrica**.

1. `$C ps worker` y `$C logs --tail=100 worker`. Si el worker está caído,
   `$C up -d --wait worker`. Al arrancar, re-encola solo los `PENDIENTE`
   (Fase 11B).
2. Si Redis está caído, ver [Redis](#redis-caído).
3. La DIAN es **simulada**: si el log dice "Proveedor DIAN (simulado) no
   disponible" sin parar, revisar `DIAN_SIMULADA_TASA_FALLA` en SSM. Con 1 todos
   los intentos fallan.
4. La caja nunca se bloquea por esto: el cobro ya quedó registrado y el
   documento se valida cuando la cola vuelve a andar.

## Redis caído

`/api/health` dice `"redis": "down"`.

- **Qué deja de funcionar:**
  - los eventos en vivo entre los dos backends;
  - las colas (fiscal, acuses, correo).
- **Qué sigue funcionando:** cobrar, porque los documentos quedan `PENDIENTE`.
- **Cómo volver:** `$C up -d --wait redis`. Con AOF (`--appendonly yes`), los
  trabajos encolados sobreviven al reinicio. El worker re-encola los
  `PENDIENTE` al arrancar: si hace falta, `$C restart worker`.

## Base de datos caída

`/api/health` dice `"postgres": "down"`: sin base no hay servicio.

1. `$C logs --tail=100 postgres`. Lo más común es el disco lleno (ver
   arriba).
2. `$C up -d --wait postgres`, y luego `$C up -d --wait` para lo que dependa
   de ella.
3. **La réplica** (`postgres-replica`) solo la usan los reportes (Fase 13). Si
   se cae, `/panel` falla y lo demás sigue. Si no se pone al día, se recrea:

   ```bash
   $C stop postgres-replica
   $C rm -f postgres-replica
   docker volume rm comanda_postgres-replica-data
   $C up -d --wait postgres-replica
   ```

   El script de la réplica vuelve a copiar el primario con `pg_basebackup`.

## Restaurar la base desde un respaldo

Los respaldos diarios a S3 son de la Fase 18 (Parte 1). Suponiendo un
`pg_dump -Fc` en `s3://<bucket-de-respaldos>/respaldos/<fecha>.dump`:

```bash
aws s3 cp s3://<bucket-de-respaldos>/respaldos/<fecha>.dump /tmp/respaldo.dump
$C stop backend-1 backend-2 worker          # que nadie escriba mientras tanto
docker cp /tmp/respaldo.dump "$($C ps -q postgres)":/tmp/respaldo.dump
$C exec postgres sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/respaldo.dump'
$C run --rm migrate                          # migraciones nuevas + contraseña del rol comanda_app
$C up -d --wait
```

Después:

- recrear la réplica (ver arriba);
- verificar con `scripts/prueba-integracion.mjs` (`docs/despliegue-aws.md`,
  sección 12).

## Volver a una versión anterior

Cada commit de `main` publica imágenes con su etiqueta en GHCR (Fase 18B).
Para volver a la anterior:

```bash
git -C /opt/comanda log --oneline -5          # o la lista de paquetes en GitHub
/opt/comanda/deploy/desplegar.sh <commit-anterior>
```

**Ojo con las migraciones:** Prisma no las revierte. Si la versión nueva
cambió el esquema de forma incompatible, restaurar también la base.

## Certificado vencido o inválido

El cron renueva dos veces al día; se puede revisar y forzar a mano:

```bash
cat /var/log/comanda-certificado.log
/opt/comanda/deploy/certificado.sh renovar
```

Si el dominio cambió, volver a emitir con `deploy/certificado.sh emitir`, o
con `comodin` si hay subdominios (Fase 20B).

## Presupuesto (AWS Budgets)

Llega un aviso de presupuesto:

1. revisar **Billing → Cost Explorer** por servicio;
2. lo que cobra aunque nadie lo use son la Elastic IP, CloudFront y la EC2
   encendida;
3. detener la instancia entre sesiones;
4. al terminar el proyecto, seguir la tabla de destrucción de
   `docs/despliegue-aws.md`.
