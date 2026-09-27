# Alcance del prototipo — qué es propuesta y qué está implementado

Este documento existe para poder sustentar, en la exposición, la diferencia entre
lo que dice la propuesta completa de **Comanda Central** (19 servicios) y lo que
realmente corre en este prototipo local (un *vertical slice*).

Los documentos fuente completos (propuesta y guion de sustentación) están en
[`docs/propuesta/`](propuesta/): `comanda-central-propuesta.pdf` (documento
oficial de la asignatura) y `comanda-central-sustentacion.html` (slides +
notas del orador, se abre directo en el navegador). Todo lo que este archivo
dice sobre "qué pide la propuesta" viene de ahí.

## Vertical slice implementado

Flujo demostrado end-to-end, en local, con dos pestañas del navegador:

1. Mesero abre una mesa y envía una comanda (**CU-01**, parcial).
2. Cocina (KDS) recibe la comanda en tiempo real por WebSocket, sin recargar.
3. Cocina marca el pedido como LISTO; mesero/caja lo ven actualizarse en vivo.
4. Caja cobra, genera un documento fiscal **simulado** con consecutivo por sede
   (**CU-02**, versión simulada, sin DIAN real) y libera la mesa.

Módulos de backend que participan: `AuthModule`, `BranchesModule`,
`CatalogModule`, `TablesModule`, `OrdersModule`, `PaymentsModule`,
`RealtimeModule`, `ReportsModule`. (`TenantsModule`/`UsersModule` de la
propuesta no se separaron en módulos propios — ver `CLAUDE.md`.)

## Los 8 casos de uso de la propuesta (§3.1) y su estado aquí

| Caso de uso | Estado en el prototipo |
|---|---|
| CU-01 Pedido en mesa | **Parcial.** Sin tablet dedicada ni impresora; el resto del flujo (mesero → WebSocket → cocina) sí corre. |
| CU-02 Cobro y documento fiscal | **Parcial/simulado.** Se cobra y se genera el documento con consecutivo por sede, pero no se transmite a la DIAN. |
| CU-03 Menú QR | **No implementado.** No hay `GET /menu/{cadena}/{sede}` público ni vista de comensal. |
| CU-04 Domicilio web | **No implementado.** |
| CU-05 Pedido de plataforma (Rappi) | **No implementado.** No se integra ninguna API externa. |
| CU-06 Panel multi-sede | **Implementado (Fase 9).** `GET /reportes/consolidado` + `/panel` (solo ADMIN): ventas de las 3 sedes de la cadena agrupadas por sede/día/canal, en vivo vía `venta:registrada`. No cruza varias cadenas (no aplica: cada cadena es un tenant separado) ni usa réplica de lectura. |
| CU-07 Operación sin conexión | **No implementado.** Solo se tomó la idea de idempotencia (UUID del cliente en `Pedido`); no hay IndexedDB, cola local ni `POST /sync`. |
| CU-08 Catálogo centralizado | **Implementado (Fase 10).** `POST`/`PATCH`/`DELETE /productos` (solo ADMIN) + `/catalogo`: ADMIN crea, edita o desactiva un producto una sola vez y se propaga a las 3 sedes de la cadena en vivo vía `catalogo:actualizado` (lo escucha `/mesas`). Baja lógica (`activo`), no borrado físico. |

## Explícitamente fuera de alcance (stubs marcados en código)

Estos puntos existen en la propuesta original pero **no están implementados de
verdad** en este prototipo. Donde hay un stub, está marcado en el código como
`// TODO PRODUCCIÓN`:

- Integración real con la **DIAN** (facturación electrónica) — el documento fiscal
  es simulado, `estado_dian` siempre queda en `SIMULADO`, `url_xml` siempre `null`.
- Integración con **Rappi** u otras plataformas de domicilios.
- **Menú QR** público para clientes (`GET /menu/{cadena}/{sede}` de la
  propuesta, slide 10, no existe en este backend).
- **Domicilios web** propios.
- **Panel multi-sede consolidado** (reportes cruzando varias sedes/cadenas).
- **Modo offline / PWA** en el cliente del mesero (IndexedDB, cola local,
  `POST /sync`) — solo se tomó la idea de idempotencia por UUID, no el modo
  offline en sí.
- **Réplica de lectura** de base de datos (la propuesta la usa específicamente
  para separar los reportes de la carga transaccional; aquí `ReportsService`
  lee de la misma instancia que todo lo demás).
- **Row Level Security (RLS)** de PostgreSQL para aislamiento multi-tenant — en
  el prototipo el aislamiento por `cadena_id` se aplica a nivel de aplicación
  (filtros explícitos en cada query), no a nivel de motor de base de datos.
- **HTTPS/TLS 1.3 y WSS** — en local todo corre sobre HTTP/WS sin cifrado; en
  producción esto sería obligatorio (ver README, sección "Servicios
  telemáticos usados y por qué").
- **DNS / subdominio por cadena** para multi-tenant en producción (p. ej.
  `lacadena.comandacentral.co`) — en el prototipo el tenant se resuelve por el
  `cadena_id` embebido en el JWT, no por subdominio.
- **Infraestructura de alta disponibilidad** de la propuesta (§5.1): CDN,
  proxy inverso Nginx con límite de tasa, dos servidores de aplicación
  balanceados, cola de mensajes + trabajadores asíncronos para DIAN/Rappi,
  almacén de objetos separado, monitoreo y respaldos. El prototipo es una
  sola instancia de cada pieza (un backend, un Postgres, un Redis) porque el
  volumen de una demo no lo justifica.
- **SSH (solo con llaves), NTP, SMTP y Syslog centralizado** (§5.2 de la
  propuesta) — protocolos de operación de servidores de producción; no
  aplican a un prototipo que corre en Docker local.

## Diferencias con el ER completo de la propuesta (§6.2)

El ER de la propuesta tiene más entidades y campos que el `schema.prisma` de
este prototipo (ver `backend/prisma/schema.prisma`). Diferencias, todas
intencionales por alcance:

- **No existen `Cliente`, `Insumo`, `MovimientoInventario` ni `Receta`.** No
  hay registro de comensales (el pedido solo referencia `mesaId`/`usuarioId`,
  nunca un cliente) ni gestión de inventario/recetas — vender un producto no
  descuenta ningún insumo. Ninguno de los dos hace parte del *vertical slice*.
- **`Pedido.canal`** solo acepta `SALON` (enum `CanalPedido`); la propuesta
  contempla también domicilio y plataformas, coherente con que CU-04/CU-05 no
  están implementados.
- **`DocumentoFiscal`** no tiene el campo `CUDE/CUFE` del ER (el identificador
  real que asigna la DIAN): no aplica a un documento simulado.
- Desde la **Fase 8**, `Sede.rangoInicio`/`rangoFin`/`siguienteConsecutivo`
  implementan de verdad el rango de numeración pre-asignado por sede que
  describe la propuesta (§6.3) — ver la sección "Numeración fiscal por sede
  (Fase 8)" más abajo.

## Decisiones de prototipo (no vienen del documento original)

Marcadas también en el código como `// DECISIÓN DE PROTOTIPO`:

- **Prisma** como ORM (el documento no fijaba una elección de ORM). Se usa
  Prisma 7, que requiere Node ≥ 22 y separa la configuración en dos archivos:
  `backend/prisma/schema.prisma` (modelos) y `backend/prisma.config.ts`
  (conexión para `migrate`/`db seed`); el cliente en tiempo de ejecución se
  conecta con un *driver adapter* (`@prisma/adapter-pg`) en
  `backend/src/prisma/prisma.service.ts`.
- **Socket.IO** como librería de WebSocket sobre el Gateway de NestJS.
- **JWT** como mecanismo de autenticación. El frontend guarda el token en
  `localStorage` (`frontend/src/auth/AuthContext.tsx`); en producción se
  evaluaría una cookie httpOnly para no exponerlo a JavaScript del cliente.
- El **UUID del pedido se genera en el cliente** y viaja en la petición, para
  dejar lista la idempotencia que necesitará el futuro modo offline.
- Backend y frontend se dockerizan en modo *dev* (hot reload vía volúmenes)
  desde la Fase 0, para que todo el prototipo se levante con `docker compose up`
  sin depender de instalaciones locales de Node.
- Monorepo simple sin herramienta de orquestación (sin Nx/Turborepo).

## Máquina de estados del Pedido

```
ABIERTO → EN_PREPARACION → LISTO → PAGADO
```

No se permiten saltos hacia atrás ni saltos que se salten un estado; la
validación vive en `OrdersModule`.

- `POST /pedidos` crea el pedido directo en `EN_PREPARACION`, sin pasar por
  `ABIERTO`: en el flujo del mesero, "armar el pedido" ocurre en el carrito
  del frontend y "enviar comanda" es la única llamada al backend, así que ese
  único POST ya representa la comanda entrando a cocina.
- `PATCH /pedidos/:id/estado` solo permite `ABIERTO`/`EN_PREPARACION`/`LISTO`
  como destino; `PAGADO` queda reservado para `POST /pagos` (Fase 5), que
  además de cambiar el estado registra el pago, genera el documento fiscal y
  libera la mesa.
- El aislamiento multi-tenant de `sedes`/`pedidos`/`productos` responde con
  `404` (no `403`) cuando el recurso pertenece a otra cadena, para no
  confirmarle a un usuario ajeno que ese id existe.

## Tiempo real (Fase 4)

- El handshake de Socket.IO exige el JWT (`socket.handshake.auth.token`) y
  valida, en `sede:unirse`, que la sede pedida sea de la cadena del token
  antes de unir al cliente a la room `sede:{id}` — mismo aislamiento
  multi-tenant que ya aplicaba en REST, ahora también en el canal en tiempo
  real.
- Se agregó `GET /pedidos?sedeId=` (no estaba en la lista original del §5)
  para que `/cocina` pueda hidratar el tablero con los pedidos
  `EN_PREPARACION`/`LISTO` ya existentes al montar, antes de que empiecen a
  llegar eventos en vivo. El documento de propuesta dice "expón al menos
  estos endpoints", así que esta extensión se considera dentro de alcance.
- Desde la Fase 7, el seed crea **3 sedes** por cadena (antes 1) y el
  frontend tiene un selector de sede (`SedeContext` +
  `SelectorSedeGlobal`, visible solo para ADMIN). MESERO/CAJERO no ven el
  selector: operan siempre en la última sede elegida en ese navegador,
  guardada en `localStorage` (`comanda.sedeId`) — el schema de `Usuario` no
  tiene una sede asignada, así que no hay forma de resolverla del lado del
  backend; ver `CLAUDE.md`. `useSedeActual` conserva su firma de antes
  (`{ sede, cargando, error }`) como fachada de solo lectura sobre
  `SedeContext`.

## Cobro y documento fiscal simulado (Fase 5)

- `POST /pagos` solo acepta pedidos en estado `LISTO` y exige que el `monto`
  coincida exactamente con `pedido.total`: no hay pagos parciales, propinas
  ni descuentos en este slice.
- El consecutivo del `DocumentoFiscal` sale de un `UPDATE` atómico sobre la
  `Sede` (ver "Numeración fiscal por sede (Fase 8)" más abajo), dentro de la
  misma transacción que crea el `Pago`, actualiza el `Pedido` a `PAGADO` y
  libera la `Mesa`.
- `estadoDian` queda fijo en `SIMULADO` y `urlXml` en `null`: no hay
  generación ni firma de XML, ni radicación ante la DIAN.

## Numeración fiscal por sede (Fase 8)

- `Sede` tiene `rangoInicio`, `rangoFin` y `siguienteConsecutivo` (antes solo
  existía `rangoNumeracion`, un campo de texto sin uso real — ver
  `CLAUDE.md`). El seed le asigna a cada una de las 3 sedes demo un rango que
  no se solapa con el de las otras (1–1000, 1001–2000, 2001–3000), tal como
  pide la propuesta en §6.3 ("a cada sede se le pre-asigna un rango de
  numeración propio").
- `PaymentsService.pagar` toma el consecutivo con
  `tx.sede.update({ data: { siguienteConsecutivo: { increment: 1 } } })`
  dentro de la transacción: Postgres bloquea la fila de la sede al hacer el
  `UPDATE`, así que dos cajeros cobrando a la vez en la misma sede quedan
  serializados (el segundo espera a que el primero confirme o revierta antes
  de leer el valor) — reemplaza el `MAX(consecutivo) + 1` de la Fase 5, que
  sí tenía una condición de carrera real entre cajas concurrentes.
- Si el consecutivo calculado supera `rangoFin`, `pagar` lanza `409
  Conflict` y, como la excepción ocurre dentro de la transacción, el
  incremento también se revierte (el contador no sigue avanzando en cada
  intento fallido una vez agotado el rango).
- Lo que la propuesta sí pide y este prototipo no implementa: qué pasa
  cuando una sede agota su rango en producción (pedir uno nuevo, o ampliarlo)
  — no hay endpoint de administración para eso, queda `// TODO PRODUCCIÓN`.

## Panel multi-sede consolidado (Fase 9, CU-06)

- `GET /reportes/consolidado?desde=&hasta=` (solo ADMIN, `@Roles('ADMIN')`
  sobre el `@Roles('CAJERO', 'ADMIN')` del controlador) agrupa los pagos de
  **todas** las sedes de la cadena por sede, día y canal. Sin `desde`/`hasta`
  el rango es "hoy" (mismo criterio UTC que `GET /reportes/ventas`).
  Agrupar por `Pedido.canal` sin asumir qué valores existen es deliberado:
  hoy solo hay `SALON`, pero si la Parte 2 agrega `DOMICILIO` (Fase 8B),
  aparece solo como otra fila, sin tocar este código.
- Tiempo real: todo socket autenticado se une, al conectarse, a la room
  `cadena:{cadenaId}` (además de la room `sede:{id}` a la que se une con
  `sede:unirse`). `PaymentsService.pagar` emite `venta:registrada` a esa room
  después de cada cobro exitoso, así que `/panel` se actualiza solo, sin
  recargar ni hacer polling — mismo patrón que `comanda:nueva`/
  `pedido:actualizado` por sede.
- Frontend: página `/panel`, protegida con `roles={['ADMIN']}` en
  `ProtectedRoute` (ver `App.tsx`); no depende de `SedeContext` porque ya
  muestra las 3 sedes a la vez (cada fila trae su propio nombre de sede desde
  el backend).
- Sigue leyendo de la misma base transaccional que todo lo demás: la réplica
  de lectura que la propuesta pide específicamente para separar reportes del
  tráfico de venta (§5.1) queda `// TODO PRODUCCIÓN`; a la escala de esta
  demo (unas pocas sedes, tráfico bajo) no hace falta.

## Catálogo centralizado (Fase 10, CU-08)

- `Producto.activo` (`Boolean @default(true)`) reemplaza el borrado físico:
  `DELETE /productos/:id` es una baja lógica (`activo = false`), no un
  `DELETE` de la fila. Necesario porque `PedidoDetalle` de pedidos ya
  pagados sigue apuntando al producto — borrarlo de verdad rompería el
  historial.
- `GET /productos` (cualquier rol autenticado) solo devuelve productos
  activos. ADMIN puede pedir `?incluirInactivos=true` para ver también los
  desactivados (para poder reactivarlos desde `/catalogo`); el backend
  ignora ese parámetro si quien lo pide no es ADMIN, no solo lo oculta en la
  interfaz.
- `POST` / `PATCH` / `DELETE /productos/:id` están detrás de `@Roles('ADMIN')`
  (el `GET` queda abierto a cualquier rol autenticado, igual que antes).
- `OrdersService.crear` rechaza con `409 Conflict` un pedido que incluya un
  producto ya desactivado, aunque `GET /productos` ya no lo liste: cubre al
  mesero con el catálogo desactualizado en pantalla (o una llamada directa a
  la API) mientras ADMIN lo daba de baja.
- Tiempo real: `CatalogService` emite `catalogo:actualizado` (`{ productoId,
  accion }`) a la room `cadena:{cadenaId}` después de crear/editar/desactivar
  un producto. `useComandaSocket` (ya usado por `/mesas` para
  `comanda:nueva`/`pedido:actualizado`) ganó un callback opcional
  `onCatalogoActualizado` para escucharlo por la misma conexión, en vez de
  abrir un socket aparte solo para esto.
- Frontend: página `/catalogo` (solo ADMIN) para crear, editar y
  desactivar/reactivar productos. No necesita escuchar el propio evento que
  emite: como quien edita ahí es la misma persona que ve el resultado, cada
  mutación simplemente recarga la tabla.

## Pulido (Fase 6)

- `GET /reportes/ventas` (no estaba en la lista original del §5, pero el
  documento dice "expón al menos estos endpoints") sigue el mismo espíritu
  que `GET /pedidos?sedeId=` de la Fase 4: una extensión mínima y directa,
  no una funcionalidad nueva. El "día" se calcula en UTC por simplicidad; en
  producción habría que usar la zona horaria de cada sede. Solo lo puede
  consultar CAJERO/ADMIN.
- `ReportsModule` no estaba en la lista de módulos del backend (§3 /
  `CLAUDE.md`); se agregó porque el endpoint lo pide el documento y no
  encajaba de forma natural en ninguno de los módulos existentes.
- Swagger (`/api/docs`) usa el plugin oficial `@nestjs/swagger` en
  `nest-cli.json` (`compilerOptions.plugins`) para inferir los esquemas de
  los DTOs automáticamente a partir de los decoradores de `class-validator`,
  en vez de anotar cada campo a mano con `@ApiProperty()`.
