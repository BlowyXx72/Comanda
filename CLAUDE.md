# Comanda — contexto persistente para Claude Code

Prototipo local (asignatura Servicios Telemáticos) de "Comanda Central": SaaS
multi-sede para micro-cadenas de restaurantes. Este repo implementa un
**vertical slice**, no el producto completo de 19 servicios. Ver
[`docs/prototipo-slice.md`](docs/prototipo-slice.md) para el alcance exacto.

## Regla de oro

No inventar funcionalidades como si vinieran de la propuesta original. Todo lo
agregado que no esté en el documento de propuesta va marcado en el código:

- `// DECISIÓN DE PROTOTIPO` — algo que decidimos nosotros porque la propuesta
  no lo fijaba (p. ej. Prisma, Socket.IO, JWT).
- `// TODO PRODUCCIÓN` — un stub de algo que la propuesta sí pide pero que
  este prototipo no implementa de verdad (DIAN real, Rappi, menú QR,
  domicilios, panel multi-sede, offline/PWA, réplica de lectura, RLS).

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

`AuthModule`, `TenantsModule`, `BranchesModule`, `UsersModule`,
`CatalogModule`, `TablesModule`, `OrdersModule`, `PaymentsModule`,
`RealtimeModule`. Deben quedar desacoplados entre sí (import solo lo que cada
uno expone explícitamente) aunque se desplieguen juntos.

## Eventos WebSocket

Room por sede: `sede:{id}`. Eventos: `comanda:nueva` (nuevo pedido, lo
escucha el KDS) y `pedido:actualizado` (cambio de estado, lo escuchan mesero y
caja). Ver README, sección "Servicios telemáticos usados y por qué", para la
justificación de por qué WebSocket y no polling.

## Fuera de alcance explícito (no implementar de verdad)

DIAN real, Rappi, menú QR, domicilios web, panel multi-sede consolidado,
offline/PWA, réplica de lectura. Dejar como stubs marcados
`// TODO PRODUCCIÓN` si se necesita un punto de extensión.

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
