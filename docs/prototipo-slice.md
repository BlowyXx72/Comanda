# Alcance del prototipo — qué es propuesta y qué está implementado

Este documento existe para poder sustentar, en la exposición, la diferencia entre
lo que dice la propuesta completa de **Comanda Central** (19 servicios) y lo que
realmente corre en este prototipo local (un *vertical slice*).

## Vertical slice implementado

Flujo demostrado end-to-end, en local, con dos pestañas del navegador:

1. Mesero abre una mesa y envía una comanda (**CU-01**, parcial).
2. Cocina (KDS) recibe la comanda en tiempo real por WebSocket, sin recargar.
3. Cocina marca el pedido como LISTO; mesero/caja lo ven actualizarse en vivo.
4. Caja cobra, genera un documento fiscal **simulado** con consecutivo por sede
   (**CU-02**, versión simulada, sin DIAN real) y libera la mesa.

Módulos de backend que participan: `AuthModule`, `TenantsModule`, `BranchesModule`,
`UsersModule`, `CatalogModule`, `TablesModule`, `OrdersModule`, `PaymentsModule`,
`RealtimeModule`.

## Explícitamente fuera de alcance (stubs marcados en código)

Estos puntos existen en la propuesta original pero **no están implementados de
verdad** en este prototipo. Donde hay un stub, está marcado en el código como
`// TODO PRODUCCIÓN`:

- Integración real con la **DIAN** (facturación electrónica) — el documento fiscal
  es simulado, `estado_dian` siempre queda en `SIMULADO`, `url_xml` siempre `null`.
- Integración con **Rappi** u otras plataformas de domicilios.
- **Menú QR** público para clientes.
- **Domicilios web** propios.
- **Panel multi-sede consolidado** (reportes cruzando varias sedes).
- **Modo offline / PWA** en el cliente del mesero.
- **Réplica de lectura** de base de datos.
- **Row Level Security (RLS)** de PostgreSQL para aislamiento multi-tenant — en
  el prototipo el aislamiento por `cadena_id` se aplica a nivel de aplicación
  (filtros explícitos en cada query), no a nivel de motor de base de datos.
- **HTTPS/TLS y WSS** — en local todo corre sobre HTTP/WS sin cifrado; en
  producción esto sería obligatorio (ver README, sección "Servicios
  telemáticos usados y por qué").
- **DNS / subdominio por cadena** para multi-tenant en producción — en el
  prototipo el tenant se resuelve por el `cadena_id` embebido en el JWT, no por
  subdominio.

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
- El frontend asume **una sola sede por cadena** (coherente con el seed) y
  toma la primera de `GET /sedes` en `useSedeActual`; no hay selector
  multi-sede en la interfaz — eso pertenece al panel multi-sede consolidado,
  fuera de alcance de este prototipo.
