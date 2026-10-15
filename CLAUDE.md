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
  este prototipo no implementa de verdad (DIAN real, Rappi, cobro offline).

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

Multi-tenant: todas las tablas de negocio llevan `cadena_id`. El aislamiento
se aplica **a nivel de aplicación** (filtrar siempre por el `cadena_id` del
JWT) desde la Fase 0; la ronda 2 (`docs/fases-siguientes-2.md`, Fase 12) añade
Row Level Security de Postgres como segunda capa, sin quitar los filtros de
aplicación.

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
CU-07) e `InventoryModule` (insumos, recetas y movimientos de inventario,
Fase 11, §6.2 — tampoco estaba en la lista original). Deben quedar
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

Room por cadena: `cadena:{cadenaId}` (Fases 9–11). Eventos: `venta:registrada`
(cobro completado, lo escucha `/panel` para actualizar el consolidado en vivo),
`catalogo:actualizado` (producto creado/editado/desactivado, lo escuchan
`/mesas` y el menú QR de todas las sedes de esa cadena) e
`inventario:actualizado` (movimiento manual o descuento automático por venta,
lo escucha `/inventario` para refrescar existencias).

## Fuera de alcance explícito (no implementar de verdad)

DIAN real y Rappi real quedan fuera bajo cualquier circunstancia (regla
dura). El resto de la infraestructura de alta disponibilidad de la propuesta
que la ronda 2 no cubre completa (§5.1: CDN, monitoreo/respaldos, SSH/NTP/
Syslog, DNS por subdominio) también sigue fuera — el prototipo es una sola
instancia de cada pieza salvo donde una fase concreta la amplíe. Dejar como
stubs marcados `// TODO PRODUCCIÓN` si se necesita un punto de extensión.
Lista completa y razonada en `docs/prototipo-slice.md`.

RLS, réplica de lectura, cola de trabajos (DIAN simulada), almacén de
objetos, proxy inverso con TLS/balanceo y SMTP **ya no están fuera de
alcance**: son la ronda 2, aprobada con el docente (`docs/fases-siguientes-2.md`,
Fases 11–14 y 11B–14B). Mientras una fase de esa lista no esté implementada,
sigue tratándose como `// TODO PRODUCCIÓN` en el código hasta que su commit
aterrice.

Desde la Fase 11 (ronda 2, §6.2), el ER ya tiene `Insumo`, `Receta` y
`MovimientoInventario`: `PaymentsService.pagar` descuenta inventario por
receta dentro de la misma transacción del cobro (`backend/src/inventory/`).
`Cliente` existe desde la Fase 8B, solo para pedidos de domicilio. Detalle en
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
