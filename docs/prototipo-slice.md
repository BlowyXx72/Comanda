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
| CU-06 Panel multi-sede | **No implementado.** El frontend asume una sola sede (ver `useSedeActual`); no hay vista consolidada entre cadenas/sedes. |
| CU-07 Operación sin conexión | **No implementado.** Solo se tomó la idea de idempotencia (UUID del cliente en `Pedido`); no hay IndexedDB, cola local ni `POST /sync`. |
| CU-08 Catálogo centralizado | **No aplica a esta escala.** Con una sola sede por cadena en el seed, no hay nada que propagar entre sedes. |

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
- **`Sede.rangoNumeracion`** existe en el schema (columna de texto, ver
  `backend/prisma/schema.prisma`) pero **no se usa de verdad**: el
  consecutivo del `DocumentoFiscal` es un `MAX(consecutivo) + 1` simple por
  sede (`PaymentsService.pagar`), no un número tomado del rango pre-asignado
  que describe la propuesta (§6.3). El campo quedó como recordatorio de la
  intención original, pendiente si se retoma el proyecto.

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
- El consecutivo del `DocumentoFiscal` se calcula como
  `MAX(consecutivo) + 1` **por sede**, dentro de la misma transacción que
  crea el `Pago`, actualiza el `Pedido` a `PAGADO` y libera la `Mesa`. Para
  la escala de una demo (un cajero cobrando de a una mesa a la vez) esto es
  suficiente; en producción, con cajeros concurrentes en la misma sede, se
  necesitaría una secuencia de base de datos o un lock explícito para evitar
  una condición de carrera en el consecutivo — marcado como
  `// TODO PRODUCCION` sería lo siguiente a resolver si esto pasara a un
  entorno con más de una caja simultánea.
- `estadoDian` queda fijo en `SIMULADO` y `urlXml` en `null`: no hay
  generación ni firma de XML, ni radicación ante la DIAN.

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
