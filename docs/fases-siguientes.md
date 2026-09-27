# Fases siguientes — plan dividido en 2 partes

Las Fases 0 a 6 del prototipo ya están completas (ver `README.md`, "Plan de
fases"). Este documento define las **fases siguientes**, tomadas de los casos
de uso que `docs/prototipo-slice.md` marca como pendientes y de la §6.3 de la
propuesta (`docs/propuesta/comanda-central-propuesta.pdf`).

El trabajo se reparte en **dos partes que se desarrollan en paralelo** y al
final se integran en `main`:

| Parte | Responsable | Tema | Rama |
|---|---|---|---|
| **Parte 1** | Miguel (Claude Code de Miguel) | Operación interna multi-sede: sedes, numeración fiscal, panel del dueño, catálogo centralizado | `parte-1` |
| **Parte 2** | Compañero (Claude Code del compañero) | Canales hacia el cliente y resiliencia: menú QR, domicilio web, modo offline | `parte-2` |

> **Para el Claude Code que lea esto:** respeta `CLAUDE.md` (regla de oro,
> marcas `// DECISIÓN DE PROTOTIPO` / `// TODO PRODUCCIÓN`, un commit por fase
> y pausa para mostrar avance). Trabaja **solo** en tu parte y en tu rama.
> Antes de tocar un archivo de la lista "compartidos", lee la sección
> [Contratos de integración](#contratos-de-integración).

Siguen fuera de alcance (no cambian con este plan): DIAN real, Rappi real
(CU-05), RLS, réplica de lectura e infraestructura de alta disponibilidad.

---

## Parte 1 — Operación interna multi-sede (Miguel)

### Fase 7 — Multi-sede real

Hoy el seed crea una sola sede y el frontend toma la primera de `GET /sedes`
(`useSedeActual`). Sin varias sedes no se pueden demostrar CU-06 ni CU-08.

- `prisma/seed.ts`: la cadena demo pasa a tener **3 sedes**, cada una con sus
  mesas.
- Frontend: `SedeContext` con selector de sede en el encabezado (visible para
  ADMIN; MESERO/CAJERO usan la sede elegida al iniciar sesión, guardada en
  `localStorage`).
- `useSedeActual` **mantiene su firma** `{ sede, cargando, error }`: solo
  cambia su implementación para leer del contexto (ver contratos).
- Commit: `Fase 7: multi-sede real (seed con 3 sedes y selector)`.

### Fase 8 — Rangos de numeración fiscal (§6.3)

La propuesta pide que "a cada sede se le pre-asigne un rango de numeración
propio, de modo que dos sedes (o una sede sin conexión) nunca generen el mismo
consecutivo". Hoy `Sede.rangoNumeracion` existe pero no se usa.

- Schema: reemplazar `Sede.rangoNumeracion` (texto) por `rangoInicio Int`,
  `rangoFin Int` y `siguienteConsecutivo Int`. Migración
  `p1_rangos_numeracion`.
- `PaymentsService.pagar`: toma el consecutivo con
  `UPDATE sedes SET siguiente_consecutivo = siguiente_consecutivo + 1 ...
  RETURNING` dentro de la transacción (quita la condición de carrera del
  `MAX + 1` actual). Si el rango se agota → `409 Conflict`.
- Seed: rangos que no se solapan entre sedes (p. ej. 1–1000, 1001–2000,
  2001–3000).
- Actualizar `docs/prototipo-slice.md` (quitar la nota de "no se usa de
  verdad").
- Commit: `Fase 8: rangos de numeración fiscal por sede`.

### Fase 9 — Panel multi-sede (CU-06)

"El dueño consulta desde cualquier lugar el consolidado de ventas de todas
las sedes en tiempo real."

- Backend (`ReportsModule`): `GET /reportes/consolidado?desde=&hasta=`, solo
  ADMIN. Devuelve ventas por sede, por día y **por canal** (agrupando por
  `Pedido.canal` sin asumir valores fijos, para que los canales de la Parte 2
  aparezcan solos).
- Tiempo real: nueva room `cadena:{cadenaId}` y evento `venta:registrada`
  emitido por `PaymentsService` después de cada cobro (ver contratos).
- Frontend: página `/panel` (solo ADMIN) con tabla por sede + totales, que se
  actualiza en vivo con `venta:registrada`.
- Sigue leyendo de la base principal: réplica de lectura queda
  `// TODO PRODUCCIÓN`.
- Commit: `Fase 9: panel multi-sede consolidado (CU-06)`.

### Fase 10 — Catálogo centralizado (CU-08)

"La administración actualiza precios o el menú una sola vez y el cambio se
propaga a todas las sedes."

- Backend (`CatalogModule`): `POST /productos`, `PATCH /productos/:id`,
  `DELETE /productos/:id` (baja lógica con campo `activo Boolean @default(true)`),
  solo ADMIN. Migración `p1_producto_activo`. `GET /productos` devuelve solo
  activos.
- Tiempo real: evento `catalogo:actualizado` a la room `cadena:{cadenaId}`;
  mesero y caja recargan el catálogo al recibirlo.
- Frontend: página `/catalogo` (solo ADMIN) para crear/editar/desactivar.
- Commit: `Fase 10: catálogo centralizado (CU-08)`.

---

## Parte 2 — Canales hacia el cliente y resiliencia (compañero)

### Fase 7B — Menú QR público (CU-03)

"El comensal escanea el código QR de la mesa y consulta el menú desde el
navegador de su teléfono, sin instalar aplicaciones."

- Backend: nuevo `PublicMenuModule` con `GET /menu/:cadenaId/:sedeId`
  **sin JWT**. Devuelve nombre de la sede y productos activos por categoría
  (solo lectura, sin datos internos). Debe validar que la sede pertenezca a la
  cadena (si no, `404`).
- Frontend: ruta pública `/menu/:cadenaId/:sedeId` (fuera de
  `ProtectedRoute`), pensada para móvil.
- Generación del QR: botón en `/mesas` que muestra el QR de cada mesa
  apuntando a `/menu/:cadenaId/:sedeId?mesa=N`. Librería de QR en el
  frontend → marcar `// DECISIÓN DE PROTOTIPO`.
- CDN para imágenes del menú: `// TODO PRODUCCIÓN`.
- Commit: `Fase 7B: menú QR público (CU-03)`.

### Fase 8B — Domicilio web (CU-04)

"Un cliente remoto hace un pedido de domicilio desde la página web de la
cadena; la sede correspondiente lo recibe en su tablero."

- Schema (migraciones con prefijo `p2_`):
  - `CanalPedido` agrega `DOMICILIO`.
  - Nueva entidad `Cliente` del ER (§6.2): `id`, `cadenaId`, `nombre`,
    `telefono`, `direccion`.
  - `Pedido.usuarioId` pasa a opcional y se agrega `Pedido.clienteId`
    opcional (un domicilio no lo crea un usuario interno).
- Backend: `POST /public/pedidos/domicilio` sin JWT (UUID generado en el
  cliente, igual que `POST /pedidos`). Crea el pedido en `EN_PREPARACION`,
  `mesaId = null`, y emite `comanda:nueva` a `sede:{id}` (**reutilizar**
  `RealtimeGateway.emitirComandaNueva`, no crear otro evento).
- Frontend: formulario público en la vista de menú para pedir a domicilio.
  Cocina y caja muestran una etiqueta "Domicilio" cuando `canal ===
  'DOMICILIO'` (en lugar del número de mesa).
- `PaymentsService` ya soporta `mesaId` nulo; no hace falta tocarlo.
- Rate limiting del endpoint público: `// TODO PRODUCCIÓN`.
- Commit: `Fase 8B: domicilio web (CU-04)`.

### Fase 9B — Operación sin conexión (CU-07)

"La sede pierde internet: el POS sigue vendiendo con su caché local y
sincroniza automáticamente al reconectar." (§6.3: IndexedDB + cola de
operaciones + UUID para descartar duplicados.)

- Frontend del mesero: PWA mínima (service worker + manifest), catálogo y
  mesas cacheados en IndexedDB, y una **cola local** de pedidos cuando
  `navigator.onLine === false` o falla la red.
- Backend: `POST /sync` (con JWT) que recibe un lote de pedidos y aplica cada
  uno con la **misma lógica** de `OrdersService.crear` (idempotente por UUID:
  si ya existe, se reporta como duplicado y no se crea de nuevo). Responde el
  resultado por pedido.
- Indicador visual "Sin conexión — N pedidos pendientes" en `/mesas`.
- Alcance: solo pedidos. El cobro offline y los consecutivos fiscales offline
  quedan `// TODO PRODUCCIÓN` (dependen de los rangos de la Fase 8).
- Commit: `Fase 9B: modo offline con cola local y POST /sync (CU-07)`.

---

## Contratos de integración

Estas reglas existen para que las dos partes se unan sin romperse.

### 1. Propiedad de archivos

| Archivo / carpeta | Dueño | Regla para el otro |
|---|---|---|
| `backend/src/reports/`, `backend/src/catalog/`, `backend/src/branches/`, `backend/src/payments/` | Parte 1 | No tocar |
| `backend/src/public-menu/` (nuevo), `backend/src/sync/` (nuevo), `frontend/src/offline/` (nuevo), páginas públicas | Parte 2 | No tocar |
| `backend/src/orders/` | Parte 2 | Parte 1 no lo toca |
| `backend/prisma/schema.prisma` | Compartido | Parte 1 solo toca `Sede` y `Producto`; Parte 2 solo toca `CanalPedido`, `Pedido` y el nuevo `Cliente` |
| `backend/src/realtime/realtime.gateway.ts` | Parte 1 | Parte 2 solo **usa** `emitirComandaNueva` / `emitirPedidoActualizado` |
| `backend/src/app.module.ts`, `frontend/src/App.tsx` | Compartido | Solo **agregar** líneas (imports / rutas), nunca reordenar ni borrar |
| `frontend/src/pages/Mesas.tsx` | Compartido | Parte 1 no lo toca **salvo** una excepción ya aplicada (Fase 10): factorizó `listarProductos` en un `cargarProductos()` y agregó `onCatalogoActualizado: () => cargarProductos()` a la llamada existente de `useComandaSocket` (4 líneas, nada de JSX ni de `enviarComanda`). Parte 2 agrega QR y offline sobre esa base |
| `frontend/src/realtime/useComandaSocket.ts` | Compartido | Parte 1 le agregó (Fase 10) el callback opcional `onCatalogoActualizado` — no rompe las llamadas existentes que no lo usan (`/cocina`, `/caja`). Parte 2 puede seguir usándolo tal cual |
| `frontend/src/api/comanda.ts` | Compartido | Solo agregar funciones/tipos nuevos |
| `prisma/seed.ts` | Parte 1 | Parte 2 pide lo que necesite en su PR (p. ej. clientes demo) y se agrega al integrar |

### 2. Interfaces que no cambian

- `useSedeActual()` sigue devolviendo `{ sede, cargando, error }`.
- Eventos existentes `comanda:nueva` y `pedido:actualizado` en `sede:{id}`:
  mismo nombre y mismo payload (el pedido con `include` de `sede`, `mesa`,
  `detalles.producto`). Un pedido de domicilio llega con `mesa: null` y
  `canal: 'DOMICILIO'`.
- Nuevos eventos (Parte 1), en la room `cadena:{cadenaId}`:
  - `venta:registrada` → `{ sedeId, pedidoId, canal, total, fechaHora }`
  - `catalogo:actualizado` → `{ productoId, accion: 'CREADO' | 'ACTUALIZADO' | 'DESACTIVADO' }`
- `GET /productos` devolverá solo productos `activo = true` después de la
  Fase 10. El menú público (Parte 2) debe filtrar igual: hasta que se integre
  la Parte 1, puede leer todos los productos y dejar un comentario
  `// al integrar Parte 1: filtrar activo = true`.

### 3. Migraciones de Prisma

- Cada parte crea sus migraciones con prefijo en el nombre:
  `npx prisma migrate dev --name p1_...` o `--name p2_...`.
- Si al integrar las dos ramas el historial de migraciones queda
  desordenado: en la rama que se integra de segunda, borrar **solo sus
  propias** carpetas de migración, rebasear sobre `main` y volver a generarlas
  con `migrate dev` (el cambio al `schema.prisma` ya está en el archivo).

### 4. Flujo de ramas e integración

1. Cada uno trabaja en su rama (`parte-1` / `parte-2`) desde `main`.
2. Un commit por fase, como pide `CLAUDE.md`.
3. Orden de integración: **primero Parte 1, luego Parte 2**. Antes de
   integrar, la Parte 2 hace `git rebase origin/main`, resuelve conflictos en
   los archivos compartidos (solo deberían ser líneas agregadas) y regenera
   migraciones si hace falta (punto 3).
4. Se integra con un Pull Request a `main`; el otro revisa.

### 5. Prueba de integración final (cuando ambas partes estén en `main`)

Con `docker compose up -d` y `docker compose exec backend npx prisma db seed`:

1. ADMIN crea un producto en `/catalogo` → aparece en `/mesas` y en el menú
   QR público sin recargar el mesero (CU-08 + CU-03).
2. Un cliente escanea el QR de una mesa de la **sede 2** y hace un pedido a
   domicilio → llega a `/cocina` de la sede 2 con la etiqueta "Domicilio"
   (CU-04).
3. Cocina lo marca LISTO, caja lo cobra → documento fiscal con consecutivo
   dentro del rango de la sede 2 (Fase 8) y `/panel` suma la venta en vivo,
   en la columna del canal `DOMICILIO` (CU-06).
4. Se corta la red del navegador del mesero (DevTools → Offline), se envían
   dos pedidos, se reconecta → `POST /sync` los aplica, llegan a cocina y
   `/panel` los refleja al cobrarlos. Reenviar el mismo lote no duplica nada
   (CU-07).
5. Actualizar la tabla de casos de uso de `docs/prototipo-slice.md` con el
   nuevo estado de CU-03, CU-04, CU-06, CU-07 y CU-08.
