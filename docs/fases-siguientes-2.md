# Fases siguientes (ronda 2) — plan dividido en 2 partes

La ronda 1 ([`fases-siguientes.md`](fases-siguientes.md)) ya está completa e
integrada en `main`: Fases 7–10 (Parte 1) y 7B–9B (Parte 2). Hoy CU-03, CU-04,
CU-06 y CU-08 están implementados, y CU-07 está parcial (ver la tabla de
[`prototipo-slice.md`](prototipo-slice.md)).

Esta ronda toma lo que la propuesta
([`propuesta/comanda-central-propuesta.pdf`](propuesta/comanda-central-propuesta.pdf))
pide y el prototipo todavía no tiene: el resto del ER (§6.2), el aislamiento
multi-tenant con RLS (§6.1), la réplica de lectura, la cola de trabajos, el
almacén de objetos y el proxy inverso (§5.1), SMTP (§5.2) y CU-05. Cada fase
cita la sección de la propuesta de donde sale.

| Parte | Responsable | Tema | Rama |
|---|---|---|---|
| **Parte 1** | Miguel (Claude Code de Miguel) | Datos y negocio: inventario, RLS, réplica de lectura, reportes | `r2-parte-1` |
| **Parte 2** | Dikersson (Claude Code de Dikersson) | Integraciones e infraestructura telemática: cola + DIAN simulada, plataformas simuladas, Nginx/TLS, SMTP | `r2-parte-2` |

> **Para el Claude Code que lea esto:** respeta `CLAUDE.md` (regla de oro,
> marcas `// DECISIÓN DE PROTOTIPO` / `// TODO PRODUCCIÓN`, un commit por fase
> y pausa para mostrar avance). Trabaja **solo** en tu parte y en tu rama.
> Antes de tocar un archivo compartido, lee
> [Contratos de integración](#contratos-de-integración).

## Antes de empezar: decisiones que hay que confirmar

Este plan choca con dos cosas que hoy fija `CLAUDE.md`. Ninguna fase se
empieza sin confirmarlas:

1. **Alcance.** `CLAUDE.md` deja fuera RLS, réplica de lectura y la
   infraestructura de §5.1. Esta ronda los mete adentro, así que al aprobar el
   plan hay que actualizar la sección "Fuera de alcance explícito" de
   `CLAUDE.md` y la de `prototipo-slice.md`. Conviene validarlo con el docente.
2. **Librerías y puertos nuevos.** `CLAUDE.md` exige preguntar antes de
   agregarlos:
   - `bullmq` (cola sobre el Redis que ya existe) — Fases 11B, 12B y 14B.
   - `@socket.io/redis-adapter` — Fase 13B.
   - `nodemailer` — Fase 14B.
   - Cliente S3 (`@aws-sdk/client-s3` o `minio`) — Fase 11B.
   - Nuevos contenedores: `postgres-replica`, `minio`, `nginx`, `worker`,
     `mailpit`.
   - Puerto HTTPS para Nginx (p. ej. `8443`) — Fase 13B.

**Siguen fuera de alcance** (reglas duras, no cambian): DIAN real y Rappi
real. Los "proveedores" de esta ronda son simuladores locales. También quedan
fuera CDN, DNS por subdominio, SSH, NTP, Syslog y monitoreo, porque en Docker
local no tienen nada que demostrar.

**Un hallazgo a corregir:** `CLAUDE.md` dice que Redis es el backplane del
WebSocket "a partir de Fase 4", pero hoy solo lo usa `/health`; Socket.IO no
tiene adaptador de Redis. Con una sola instancia no se nota. La Fase 13B lo
conecta de verdad.

---

## Parte 1 — Datos y negocio (Miguel)

### Fase 11 — Inventario y recetas (§6.1, §6.2)

La propuesta dice que "una venta afecta simultáneamente pedido, detalle, pago,
documento fiscal e inventario; debe confirmarse completa o no confirmarse". El
ER trae `Insumo`, `Receta` y `MovimientoInventario`, que hoy no existen.

- Schema (migración `r2p1_inventario`):
  - `Insumo`: `id`, `cadenaId`, `nombre`, `unidad`, `costoUnitario`.
  - `Receta`: `productoId`, `insumoId`, `cantidad` (PK compuesta).
  - `MovimientoInventario`: `id`, `sedeId`, `insumoId`,
    `tipo` (`ENTRADA` | `SALIDA` | `MERMA`), `cantidad`, `fecha`.
- `PaymentsService.pagar`: dentro de **la misma transacción** del cobro, crea
  un movimiento `SALIDA` por cada insumo de la receta de cada detalle. Si algo
  falla, se revierte todo, incluido el consecutivo.
- Existencias de un insumo en una sede = suma de sus movimientos. No hay
  columna de stock.
- Backend: `GET /sedes/:id/inventario` y `POST /inventario/movimientos`
  (`ENTRADA`/`MERMA`), ambos solo ADMIN. CRUD mínimo de insumos y recetas.
- Frontend: página `/inventario` (solo ADMIN) con existencias por sede.
- Seed: insumos y recetas para los productos demo.
- `// DECISIÓN DE PROTOTIPO`: la propuesta no dice qué pasa sin existencias.
  Proponemos **no bloquear la venta** y dejar el saldo negativo visible en
  `/inventario`. Confirmar antes de implementar.
- Commit: `Fase 11: inventario y recetas (§6.2)`.

### Fase 12 — Aislamiento multi-tenant con RLS (§6.1)

"Un solo esquema atiende a todas las cadenas usando una columna discriminadora
(cadena_id) con seguridad a nivel de fila (Row Level Security)". Hoy el
aislamiento es solo a nivel de aplicación.

- Rol de Postgres nuevo, **sin** privilegios de dueño, para la app
  (`DATABASE_URL_APP` en `.env` y `.env.example`). Migraciones y seed siguen
  con el rol dueño.
- Migración `r2p1_rls`: `ENABLE` + `FORCE ROW LEVEL SECURITY` y una política
  por tabla de negocio con `cadena_id = current_setting('app.cadena_id')`.
  - Tablas sin `cadena_id` (`mesas`, `pedidos`, `pedido_detalles`, `pagos`,
    `documentos_fiscales`, `movimientos_inventario`): decidir entre una
    política con `EXISTS` sobre `sedes` o agregar la columna (la propuesta dice
    que "todas las tablas de negocio llevan cadena_id").
- `PrismaService`: helper `conCadena(cadenaId, fn)` que abre una transacción y
  hace `SELECT set_config('app.cadena_id', $1, true)` antes de `fn`.
  - Los servicios pasan a usarlo.
  - Los filtros por `cadenaId` en el código **se quedan**: son la segunda
    capa, no se borran.
- Endpoints públicos (menú QR, domicilio) y el worker de la Parte 2: toman la
  cadena del path o del payload del job y usan el mismo helper.
- Prueba obligatoria: con el rol de la app, una consulta sin `app.cadena_id`
  devuelve 0 filas, y con la cadena A no se ven filas de la cadena B.
- Commit: `Fase 12: Row Level Security por cadena (§6.1)`.

### Fase 13 — Réplica de lectura para reportes (§5.1)

"PostgreSQL primario para escritura + réplica de lectura para reportes y panel
del dueño".

- `docker-compose.yml`:
  - Servicio `postgres-replica` con replicación en streaming desde `postgres`.
  - Ajustes de `postgres` (`wal_level`, usuario de replicación) y script de
    arranque que hace el `pg_basebackup`.
- Backend: segundo cliente Prisma de **solo lectura** (`DATABASE_URL_REPLICA`).
  - Lo usan solo `ReportsService` y los reportes de la Fase 14.
  - Escribir en él debe fallar; agregar una prueba que lo verifique.
- La réplica va unos milisegundos atrás. `/panel` ya suma la venta con el
  payload de `venta:registrada` sin volver a consultar; verificar que siga así.
- RLS (Fase 12) aplica igual en la réplica, porque es una copia física.
- Commit: `Fase 13: réplica de lectura para reportes (§5.1)`.

### Fase 14 — Reportes diarios, mensuales, por producto y por franja (§1.4, §6.1)

El alcance incluye un "panel consolidado multi-sede con reportes diarios y
mensuales", y §6.1 nombra "ventas por sede, por producto, por canal, por
franja horaria".

- `GET /reportes/consolidado` acepta `agrupacion=dia|mes`.
- Nuevos `GET /reportes/productos?desde=&hasta=` y
  `GET /reportes/franjas?desde=&hasta=` (ventas por hora del día). Solo ADMIN,
  leyendo de la réplica.
- Hoy el "día" se calcula en UTC. Pasar a la zona de Bogotá, que es el
  público objetivo de la propuesta.
- `/panel`: selector de agrupación y dos tablas nuevas.
- Commit: `Fase 14: reportes mensuales, por producto y por franja horaria`.

---

## Parte 2 — Integraciones e infraestructura telemática (Dikersson)

### Fase 11B — Cola de trabajos, DIAN simulada asíncrona y almacén de objetos (§5.1, §6.3)

§5.1 pide "envío del documento fiscal a la DIAN ... fuera del flujo de la
venta: la caja nunca espera a un servicio externo". §6.3 dice que "la
validación DIAN ocurre en segundo plano sin bloquear la caja". §5.1 también
pide un almacén de objetos para los XML.

- Servicio `worker` en `docker-compose.yml`: misma imagen del backend, otro
  comando de arranque. La cola es BullMQ sobre el Redis existente.
- Nuevo `FiscalModule`:
  - Después del commit del cobro, `PaymentsService` encola
    `{ documentoFiscalId, cadenaId }` (ver contrato 1).
  - El worker genera un XML **simulado** (sin firma), lo sube a MinIO y llama a
    un `ProveedorDianSimulado` con latencia y tasa de rechazo configurables
    por `.env`.
- Schema (migración `r2p2_estado_dian`): `EstadoDian` agrega `PENDIENTE`,
  `VALIDADO_SIMULADO` y `RECHAZADO_SIMULADO`. `urlXml` apunta al objeto en
  MinIO.
- Reintentos con backoff exponencial (BullMQ). Tras N fallos, el documento
  queda `RECHAZADO_SIMULADO`.
- Tiempo real: evento nuevo `documento:actualizado` en `sede:{id}`. `/caja`
  muestra el estado del documento en vivo.
- `// TODO PRODUCCIÓN`: firma digital, proveedor tecnológico autorizado real y
  CUDE/CUFE. Prohibido conectar la DIAN real.
- Commit: `Fase 11B: cola de trabajos y validación DIAN simulada en segundo plano`.

### Fase 12B — Pedidos de plataforma simulados (CU-05)

"Un pedido de Rappi entra automáticamente por API al mismo tablero de la sede,
sin re-digitación."

- Schema (migración `r2p2_plataforma`):
  - `CanalPedido` agrega `PLATAFORMA`.
  - Nueva entidad `IntegracionPlataforma`: `id`, `cadenaId`, `nombre`,
    `apiKeyHash`, `activa`.
  - `Pedido.referenciaExterna` opcional, única por plataforma.
- Backend: `POST /integraciones/plataformas/pedidos`, autenticado con API key
  por cadena (header `X-Api-Key`), sin JWT.
  - Idempotente por `referenciaExterna`.
  - Crea el pedido en `EN_PREPARACION` y emite `comanda:nueva`, reutilizando
    lo mismo que domicilio (8B).
  - El acuse de vuelta a la plataforma sale por la cola de la 11B, porque §5.1
    pide que la comunicación con Rappi vaya por el worker.
- `// DECISIÓN DE PROTOTIPO`: un **simulador de plataforma** (script o página
  `/simulador-plataforma`) que manda pedidos de prueba con su propio formato
  JSON y recibe los acuses.
  - No se copia el contrato de la API de Rappi: no se tiene acceso aprobado y
    la regla dura prohíbe integrarla.
- Cocina y caja muestran la etiqueta "Plataforma". `/panel` lo muestra solo
  como canal nuevo (Fase 9 agrupa sin asumir valores).
- Commit: `Fase 12B: pedidos de plataforma simulados por API (CU-05)`.

### Fase 13B — Proxy inverso: TLS 1.3, HTTP/2, WSS, límite de tasa y 2 instancias (§5.1, §5.2)

§5.1 pide un "punto único de entrada: terminación TLS 1.3, HTTP/2, compresión,
límite de tasa y balanceo hacia los servidores de aplicación" y "dos
instancias ... para tolerancia a fallos". §5.2 pide HTTPS y WSS para todo el
tráfico.

- Servicio `nginx` en `docker-compose.yml`. Certificado autofirmado generado
  localmente (`// DECISIÓN DE PROTOTIPO`; el script de generación queda en el
  repo, el certificado no).
  - `https://localhost:8443` sirve el frontend y hace proxy de `/api` y
    `/socket.io` (con upgrade a WSS).
  - Activa TLS 1.3, HTTP/2 y gzip.
- `backend` pasa a 2 réplicas (`backend-1`, `backend-2`) balanceadas por Nginx.
  - Socket.IO necesita afinidad de sesión (`ip_hash`) para el polling inicial
    y `@socket.io/redis-adapter`. Así, un evento emitido en una instancia
    llega a sockets conectados a la otra (corrige el hallazgo de arriba).
- `limit_req` en `/api/menu/` y `/api/public/` (resuelve el
  `// TODO PRODUCCIÓN` de rate limiting de 7B/8B).
- Efecto colateral buscado: con HTTPS, el service worker de la 9B funciona
  también desde un teléfono en la red local (hoy solo en `localhost`).
- Prueba: matar `backend-1` con la app abierta. Las peticiones siguen por
  `backend-2` y el KDS recibe comandas creadas en cualquiera de las dos.
- Commit: `Fase 13B: Nginx con TLS 1.3/HTTP2/WSS, rate limiting y 2 instancias`.

### Fase 14B — Correo: comprobante y resumen diario (§5.2)

§5.2 pide "SMTP: envío de comprobantes al comensal y resúmenes diarios al
dueño".

- Servicio `mailpit` en `docker-compose.yml`: SMTP local más bandeja web para
  verlos en la demo. Variables `SMTP_*` en `.env` y `.env.example`.
- Comprobante: cuando la DIAN simulada (11B) valida el documento de un pedido
  de domicilio, el worker envía el comprobante por correo.
  - El ER no tiene correo en `Cliente`, así que la migración `r2p2_cliente_email`
    agrega `Cliente.email` opcional y el formulario de domicilio lo pide
    (`// DECISIÓN DE PROTOTIPO`).
- Resumen diario: trabajo repetible de BullMQ (p. ej. 23:00 Bogotá) que envía a
  los ADMIN de cada cadena el consolidado del día (reutiliza el reporte de la
  Fase 9; en la demo se dispara a mano con un endpoint solo ADMIN).
- Commit: `Fase 14B: correo de comprobantes y resumen diario (SMTP)`.

---

## Contratos de integración

### 1. Propiedad de archivos

| Archivo / carpeta | Dueño | Regla para el otro |
|---|---|---|
| `backend/src/reports/`, `backend/src/catalog/`, `backend/src/branches/`, nuevo `backend/src/inventory/` | Parte 1 | No tocar |
| `backend/src/payments/` | Parte 1 | Parte 2 agrega **solo** la llamada que encola el documento fiscal, después del commit de la transacción (ver punto 2) |
| `backend/src/prisma/` | Parte 1 | Parte 2 usa `conCadena()` cuando exista; no lo modifica |
| Nuevos `backend/src/fiscal/`, `backend/src/integrations/`, `backend/src/mail/`, `backend/src/queue/`, carpeta `nginx/` | Parte 2 | No tocar |
| `backend/src/orders/`, `backend/src/public-menu/`, `backend/src/sync/`, `frontend/src/offline/` | Parte 2 | Parte 1 solo los adapta a `conCadena()` en la Fase 12 |
| `backend/prisma/schema.prisma` | Compartido | Parte 1: `Insumo`, `Receta`, `MovimientoInventario` y políticas RLS. Parte 2: `EstadoDian`, `CanalPedido`, `IntegracionPlataforma`, `Pedido.referenciaExterna`, `Cliente.email` |
| `docker-compose.yml` | Compartido | Parte 1: servicios `postgres` y `postgres-replica`. Parte 2: `worker`, `minio`, `nginx`, `mailpit` y el desdoble de `backend`. Solo agregar bloques; no reordenar |
| `.env.example`, `backend/src/app.module.ts`, `frontend/src/App.tsx`, `frontend/src/api/comanda.ts` | Compartido | Solo **agregar** líneas, nunca reordenar ni borrar |
| `prisma/seed.ts` | Parte 1 | Parte 2 pide lo que necesite (API key demo, correos demo) en su PR |

### 2. Interfaces

- **Cobro → cola fiscal (11B).** `PaymentsService.pagar` mantiene su firma y
  su transacción. Parte 2 agrega, **después** de que la transacción confirma,
  `this.colaFiscal.encolar({ documentoFiscalId, cadenaId })`. Si la cola falla,
  el cobro **no** se revierte: el documento queda `PENDIENTE` y se reintenta.
- **Inventario (11).** Va **dentro** de la transacción. Encolar va **fuera**.
  No se mezclan.
- **Contexto de cadena (12).** Todo job de la cola lleva `cadenaId` en el
  payload; el worker no tiene JWT. Las tablas nuevas de la Parte 2 llevan
  `cadena_id` (o se resuelven por `sede_id`) para que la Parte 1 pueda
  ponerles política.
- **Eventos.** Sin cambios en `comanda:nueva`, `pedido:actualizado`,
  `venta:registrada` ni `catalogo:actualizado`. El único evento nuevo es
  `documento:actualizado` → `{ documentoFiscalId, pedidoId, estadoDian, urlXml }`
  en `sede:{id}`.
- **Réplica (13).** Solo la leen los reportes; ningún módulo de la Parte 2
  escribe ni lee de ella.

### 3. Migraciones de Prisma

Prefijos `r2p1_` y `r2p2_`. Se aplica la misma regla de la ronda 1: en la rama
que se integra de segunda, sus migraciones deben quedar **después** de las de
`main`. Se regeneran con `migrate dev`, o se renombran si su SQL es
independiente; verificarlo en una base limpia con
`migrate deploy` + `migrate diff --exit-code`.

### 4. Flujo de ramas e integración

1. Cada uno trabaja en su rama (`r2-parte-1` / `r2-parte-2`) desde `main`.
2. Un commit por fase, como pide `CLAUDE.md`.
3. Orden de integración: **primero Parte 2, luego Parte 1**, al revés que en
   la ronda 1. Motivo: la RLS de la Fase 12 tiene que cubrir también las
   tablas y consultas nuevas de la Parte 2, y eso solo se puede verificar con
   todo en `main`. La Parte 1 integra `main` en su rama, agrega las políticas
   que falten y adapta `orders/`, `public-menu/`, `sync/` y el worker a
   `conCadena()`.
4. Se integra con Pull Request a `main`; el otro revisa.

### 5. Prueba de integración final (con ambas partes en `main`)

Con `docker compose up -d`, `migrate reset` y `db seed`, todo por
`https://localhost:8443`:

1. Un pedido en mesa se cobra en caja. La respuesta es inmediata, el
   documento aparece `PENDIENTE` y luego pasa a `VALIDADO_SIMULADO` en vivo,
   con su XML descargable desde MinIO (11B). Los insumos de la receta bajan
   en `/inventario` (11).
2. El simulador manda un pedido de plataforma a la sede 2. Llega a `/cocina`
   con la etiqueta "Plataforma". Reenviarlo no lo duplica (12B).
3. Un domicilio con correo, al validarse, deja el comprobante en Mailpit. El
   resumen diario disparado a mano llega al ADMIN (14B).
4. `/panel` muestra la venta por canal y por mes (Fase 14, leyendo de la
   réplica). Con `backend-1` detenido, todo lo anterior sigue funcionando por
   `backend-2` y los eventos en vivo siguen llegando (13B).
5. Con el rol de la app y la cadena A no se ven filas de una cadena B creada
   para la prueba, ni por API ni con SQL directo (12).
6. Muchas peticiones seguidas a `/api/menu/...` reciben `503`/`429` de Nginx
   (13B).
7. Actualizar `prototipo-slice.md` (CU-02, CU-05, CU-07 y la lista de fuera de
   alcance), `CLAUDE.md` y la sección "Plan de fases" del `README.md`
   (agregar la ronda 2 debajo de la ronda 1).

## Pendiente que no entra en esta ronda

- **Cobro y consecutivos fiscales sin conexión (completar CU-07).** Requiere
  reservar sub-rangos de numeración por dispositivo (§6.3) y conciliar pagos
  en `/sync`. Es el siguiente paso natural cuando la 11B (estados DIAN) y la
  Fase 8 (rangos) estén estables.
- **Sede asignada al usuario.** `Usuario` no tiene `sedeId` y la sede del
  mesero vive en `localStorage` (ver `prototipo-slice.md`). Vale la pena si se
  quiere RLS o permisos por sede, no solo por cadena.
- CDN, DNS por subdominio, SSH, NTP, Syslog/métricas y respaldos: siguen como
  `// TODO PRODUCCIÓN`.
