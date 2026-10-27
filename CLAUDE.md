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
`PedidoDetalle`, `Pago`, `DocumentoFiscal`, `Cliente`; además
`IntegracionPlataforma` (Fase 12B), que no está en el ER de la propuesta. El resto del código (nombres
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
CU-07), `InventoryModule` (insumos, recetas y movimientos de inventario,
Fase 11, §6.2 — tampoco estaba en la lista original), `FiscalModule` (Fase
11B: cola BullMQ de documentos fiscales, validación DIAN **simulada** en
segundo plano y XML en MinIO), `IntegracionesModule` (Fase 12B, CU-05:
pedidos de plataforma por API con `X-Api-Key`, contra un simulador) y
`MailModule` (Fase 14B: correo SMTP a Mailpit, comprobante de domicilio y
resumen diario), `ImagenesProductoModule` (Fase 16B, `backend/src/product-images/`:
fotos de producto para el catálogo y el menú QR, procesadas con `sharp`) y
`StorageModule` (Fase 16B: el almacén de objetos S3/MinIO que comparten fiscal
e imágenes). El procesamiento de las colas corre en un proceso aparte,
el contenedor `worker` (`src/worker.ts` + `WorkerModule`, que junta
`FiscalWorkerModule`, `IntegracionesWorkerModule` y `MailWorkerModule`), con
el mismo código del backend. Deben quedar
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

`documento:actualizado` (Fase 11B, room `sede:{id}`): el worker terminó de
validar un documento fiscal; lo escucha `/caja`. El worker no tiene sockets:
el backend lo reenvía al recibir el evento `completed` de la cola.

## Fuera de alcance explícito (no implementar de verdad)

DIAN real y Rappi real quedan fuera bajo cualquier circunstancia (regla
dura): los "proveedores" de la ronda 2 son simuladores locales. Fuera de eso,
sigue fuera el resto de la infraestructura de alta disponibilidad de la
propuesta que la ronda 2 no cubre completa (§5.1: CDN, monitoreo/respaldos,
SSH/NTP/Syslog, DNS por subdominio; el SMTP existe desde la Fase 14B, pero
contra Mailpit, que no entrega correos de verdad) — el prototipo es una sola
instancia de cada pieza salvo donde una fase concreta la amplíe. La cola de
mensajes + worker asíncrono y el almacén de objetos existen desde la Fase
11B. Desde la Fase 13B la app entra por Nginx (`https://localhost:8443`: TLS
1.3, HTTP/2, WSS, límite de tasa) con dos instancias del backend
(`backend-1`, `backend-2`); Postgres, Redis y Nginx siguen siendo una sola
instancia (salvo la réplica de lectura de Postgres, Fase 13: `postgres-replica`,
solo para reportes). Dejar como stubs marcados `// TODO PRODUCCIÓN` si se necesita un
punto de extensión. Lista completa y razonada en `docs/prototipo-slice.md`.

De la ronda 2 ([`docs/fases-siguientes-2.md`](docs/fases-siguientes-2.md)),
la Parte 2 (Fases 11B–14B) ya está completa e integrada en `main`. De la
Parte 1 (Fases 11–14, aprobada con el docente), la Fase 11 (inventario y
recetas), la Fase 12 (RLS), la Fase 13 (réplica de lectura) y la Fase 14
(reportes por día/mes, producto y franja horaria, en zona America/Bogota) ya
están implementadas: las operaciones de negocio pasan por
`PrismaService.conCadena()` (rol `comanda_app` + `app.cadena_id`) y los filtros
por `cadena_id` de la aplicación se mantienen como segunda capa. Los reportes
(`ReportsService`) leen de `postgres-replica` vía `PrismaReplicaService`; es lo
único que usa ese cliente, y `/panel` suma `venta:registrada` con el payload del
evento sin re-consultar.

Desde la Fase 11 (ronda 2, §6.2), el ER ya tiene `Insumo`, `Receta` y
`MovimientoInventario`: `OrdersService` descuenta inventario por receta
cuando la comanda entra a cocina, dentro de la misma transacción que crea el
pedido (cada `SALIDA` lleva su `pedidoId`); `PaymentsService.pagar` solo
descuenta los pedidos viejos que aún no tenían `SALIDA` (`backend/src/inventory/`).
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

Diseño del frontend: paleta del equipo `#FFA69E #FAF3DD #B8F2E6 #AED9E0
#5E6472` con modo claro/oscuro. Los colores van solo como tokens semánticos
(`--color-*` en `frontend/src/index.css`), nunca como hex sueltos en las
pantallas. Una pantalla nueva del personal: envolverla en `ProtectedRoute`
(trae la barra superior), reutilizar las clases de `App.css` (`panel-pedido`,
`comanda-card`, `panel-tabla`, `pantalla-info`...) y agregar su entrada en
`frontend/src/ui/navegacion.ts` para que aparezca en la barra y en el inicio.

Para trabajo de interfaz (frontend), el equipo usa la skill de Claude Code
**ui-ux-pro-max**. Si no está disponible en la sesión, sugerirle al usuario
instalarla con el comando de la sección "Skill de UI/UX para Claude Code" del
README (se instala por máquina, no va dentro del repo).

## Reglas duras

- No integrar DIAN ni Rappi reales bajo ninguna circunstancia en este
  prototipo.
- Preguntar antes de decisiones grandes no cubiertas aquí (nueva librería con
  impacto arquitectónico, cambio de puertos, cambio de ORM).
- Secretos y URLs solo en `.env`, nunca hardcodeados; mantener `.env.example`
  al día cuando se agregue una variable nueva.
