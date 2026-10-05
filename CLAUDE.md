# Comanda — contexto persistente para Claude Code

Prototipo local (asignatura Servicios Telemáticos, docente Mauricio Ochoa;
estudiantes Dikersson Alexis Cañón Vanegas y Miguel Jiménez) de "Comanda
Central": SaaS multi-sede para micro-cadenas de restaurantes (2 a 8 sedes).
Este repo implementa un **vertical slice**, no el producto completo de 19
servicios. Ver [`docs/prototipo-slice.md`](docs/prototipo-slice.md) para el
alcance exacto, incluyendo el estado de cada uno de los 8 casos de uso
(CU-01 a CU-08) de la propuesta.

Los documentos fuente completos de la propuesta y de la sustentación están en
[`docs/propuesta/`](docs/propuesta/) (PDF + HTML de las slides). Cualquier
afirmación sobre "qué pide la propuesta" debe verificarse ahí, no inventarse.

## Regla de oro

No inventar funcionalidades como si vinieran de la propuesta original. Todo lo
agregado que no esté en el documento de propuesta va marcado en el código:

- `// DECISIÓN DE PROTOTIPO` — algo que decidimos nosotros porque la propuesta
  no lo fijaba (p. ej. Prisma, Socket.IO, JWT).
- `// TODO PRODUCCIÓN` — un stub de algo que la propuesta sí pide pero que
  este prototipo no implementa de verdad (DIAN real, Rappi, cobro offline,
  réplica de lectura, RLS).

## Stack

- Backend: NestJS + TypeScript (monolito modular, ESM), en `backend/`.
- Frontend: React + Vite + TypeScript, en `frontend/`.
- DB: PostgreSQL vía Prisma (a partir de Fase 1).
- Caché / Pub-Sub: Redis (backplane del WebSocket, a partir de Fase 4).
- Tiempo real: Socket.IO vía Gateway de NestJS.
- Auth: JWT.
- Todo corre dockerizado (`docker compose up`); no se requiere Node local.

## Convenciones de dominio

Entidades del negocio en **español**, mapeadas 1:1 al documento de propuesta:
`Cadena` (tenant), `Sede`, `Usuario`, `Producto`, `Mesa`, `Pedido`,
`PedidoDetalle`, `Pago`, `DocumentoFiscal`. El resto del código (nombres
técnicos, infraestructura) en inglés estándar.

Multi-tenant: todas las tablas de negocio llevan `cadena_id`. En este
prototipo el aislamiento se aplica **a nivel de aplicación** (filtrar siempre
por el `cadena_id` del JWT), no con Row Level Security de Postgres (eso es
`// TODO PRODUCCIÓN`).

Máquina de estados del Pedido — no saltar estados:

```
ABIERTO → EN_PREPARACION → LISTO → PAGADO
```

El UUID del Pedido se genera en el **cliente** y viaja en la petición
(idempotencia pensando en el futuro modo offline); el backend descarta
duplicados por UUID.

## Módulos del backend (monolito modular)

Módulos que existen de verdad: `AuthModule`, `BranchesModule`,
`CatalogModule`, `TablesModule`, `OrdersModule`, `PaymentsModule`,
`RealtimeModule`, `ReportsModule` (este último no estaba en la lista
original de la propuesta; se agregó porque `GET /reportes/ventas` sí lo pide
el documento y no encajaba en ningún módulo existente), `PublicMenuModule`
(menú QR sin JWT, CU-03), `SyncModule` (`POST /sync` del modo offline,
CU-07) y `FiscalModule` (Fase 11B: cola BullMQ de documentos fiscales,
validación DIAN **simulada** en segundo plano y XML en MinIO). El
procesamiento de esa cola corre en un proceso aparte, el contenedor `worker`
(`src/worker.ts` + `FiscalWorkerModule`), con el mismo código del backend.
Deben quedar
desacoplados entre sí (import solo lo que cada uno expone explícitamente)
aunque se desplieguen juntos.

`TenantsModule` y `UsersModule` de la propuesta original **no se separaron**
en módulos propios: `Cadena` y `Usuario` se manejan directo con Prisma desde
`AuthModule` (login) y `prisma/seed.ts` (datos de demo), porque este
prototipo no tiene ningún endpoint de gestión de cadenas/usuarios que
justificara el módulo aparte. Si esa gestión se necesita más adelante, ahí
sí vale la pena separarlos.

## Eventos WebSocket

Room por sede: `sede:{id}`. Eventos: `comanda:nueva` (nuevo pedido, lo
escucha el KDS) y `pedido:actualizado` (cambio de estado, lo escuchan mesero y
caja). Ver README, sección "Servicios telemáticos usados y por qué", para la
justificación de por qué WebSocket y no polling.

Room por cadena: `cadena:{cadenaId}` (Fases 9–10). Eventos: `venta:registrada`
(cobro completado, lo escucha `/panel` para actualizar el consolidado en vivo)
y `catalogo:actualizado` (producto creado/editado/desactivado, lo escuchan
`/mesas` y el menú QR de todas las sedes de esa cadena).

`documento:actualizado` (Fase 11B, room `sede:{id}`): el worker terminó de
validar un documento fiscal; lo escucha `/caja`. El worker no tiene sockets:
el backend lo reenvía al recibir el evento `completed` de la cola.

## Fuera de alcance explícito (no implementar de verdad)

DIAN real, Rappi, cobro/facturación sin conexión, réplica de lectura, RLS, y
el resto de la infraestructura de alta disponibilidad de la propuesta (§5.1:
CDN, Nginx, balanceo entre instancias, monitoreo/respaldos, SSH/NTP/SMTP/
Syslog) — el prototipo es una sola instancia de cada pieza. La cola de
mensajes + worker asíncrono y el almacén de objetos sí existen desde la
Fase 11B, pero el "proveedor DIAN" al que hablan es un simulador local. La
ronda 2 ([`docs/fases-siguientes-2.md`](docs/fases-siguientes-2.md)) mueve
más piezas de esta lista adentro del alcance a medida que se integren. Dejar como stubs
marcados `// TODO PRODUCCIÓN` si se necesita un punto de extensión. Lista
completa y razonada en `docs/prototipo-slice.md`.

El ER de la propuesta (§6.2) tiene entidades que este prototipo no
implementa: `Insumo`, `MovimientoInventario`, `Receta` — no hay gestión de
inventario/recetas. `Cliente` sí existe, solo para pedidos de domicilio. Detalle en
`docs/prototipo-slice.md`.

Desde la Fase 8, `Sede` sí usa un rango de numeración fiscal real
(`rangoInicio`/`rangoFin`/`siguienteConsecutivo`, §6.3 de la propuesta): el
consecutivo del `DocumentoFiscal` sale de un `UPDATE ... increment` atómico
sobre la sede dentro de la transacción de `PaymentsService.pagar`, no de un
`MAX+1`.

## Flujo de trabajo

Se trabaja **por fases secuenciales** (ver README). Al terminar cada fase:
commit independiente y pausa para mostrar avance antes de seguir con la
siguiente — no adelantar varias fases de golpe sin confirmación.

## Reglas duras

- No integrar DIAN ni Rappi reales bajo ninguna circunstancia en este
  prototipo.
- Preguntar antes de decisiones grandes no cubiertas aquí (nueva librería con
  impacto arquitectónico, cambio de puertos, cambio de ORM).
- Secretos y URLs solo en `.env`, nunca hardcodeados; mantener `.env.example`
  al día cuando se agregue una variable nueva.
