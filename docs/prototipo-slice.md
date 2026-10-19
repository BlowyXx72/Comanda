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
| CU-02 Cobro y documento fiscal | **Parcial/simulado.** Se cobra y se genera el documento con consecutivo por sede. Desde la Fase 11B el documento queda `PENDIENTE` y un worker aparte genera el XML (sin firma), lo guarda en MinIO y lo "valida" contra un proveedor DIAN **simulado**, sin bloquear la caja; el estado llega a `/caja` en vivo. No se transmite a la DIAN real. |
| CU-03 Menú QR | **Implementado (Fase 7B).** `GET /menu/:cadenaId/:sedeId` sin JWT (solo productos activos, valida que la sede sea de la cadena) + vista pública `/menu/...`; `/mesas` genera el QR de cada mesa en el navegador. |
| CU-04 Domicilio web | **Implementado (Fase 8B).** `POST /public/pedidos/domicilio` sin JWT, idempotente por UUID, crea el `Cliente` y el pedido (`canal = DOMICILIO`, sin mesa) en `EN_PREPARACION` y lo emite con `comanda:nueva`; cocina y caja lo muestran como "Domicilio". Sin pago en línea ni seguimiento del repartidor; desde la Fase 13B Nginx le limita la tasa (`429`). |
| CU-05 Pedido de plataforma (Rappi) | **Implementado contra un simulador (Fase 12B).** `POST /integraciones/plataformas/pedidos` recibe el pedido con API key (`X-Api-Key`), lo crea en `EN_PREPARACION` con canal `PLATAFORMA` y llega a `/cocina` por `comanda:nueva`, sin re-digitación. Idempotente por `orderId` de la plataforma. El acuse de vuelta sale por la cola del worker. La "plataforma" es la página `/simulador-plataforma`; no se integra Rappi real. |
| CU-06 Panel multi-sede | **Implementado (Fase 9).** `GET /reportes/consolidado` + `/panel` (solo ADMIN): ventas de las 3 sedes de la cadena agrupadas por sede/día/canal, en vivo vía `venta:registrada`. No cruza varias cadenas (no aplica: cada cadena es un tenant separado) ni usa réplica de lectura. |
| CU-07 Operación sin conexión | **Parcial (Fase 9B).** Solo el mesero: PWA mínima (service worker + manifest), catálogo/mesas/sede en IndexedDB y cola local de pedidos que se vacía con `POST /sync` (idempotente por UUID: `CREADO`/`DUPLICADO`/`RECHAZADO`). El cobro y los consecutivos fiscales sin conexión quedan `// TODO PRODUCCIÓN`. |
| CU-08 Catálogo centralizado | **Implementado (Fase 10).** `POST`/`PATCH`/`DELETE /productos` (solo ADMIN) + `/catalogo`: ADMIN crea, edita o desactiva un producto una sola vez y se propaga a las 3 sedes de la cadena en vivo vía `catalogo:actualizado` (lo escucha `/mesas`). Baja lógica (`activo`), no borrado físico. |

## Explícitamente fuera de alcance (stubs marcados en código)

Estos puntos existen en la propuesta original pero **no están implementados de
verdad** en este prototipo. Donde hay un stub, está marcado en el código como
`// TODO PRODUCCIÓN`:

- Integración real con la **DIAN** (facturación electrónica) — el documento fiscal
  es simulado: el XML no sigue UBL 2.1 ni va firmado, y la "validación" la
  hace `ProveedorDianSimuladoService` (Fase 11B), no el proveedor tecnológico
  autorizado.
- Integración real con **Rappi** u otras plataformas de domicilios. Desde la
  Fase 12B existe el canal `PLATAFORMA` y su API, pero quien la usa es un
  simulador local con formato propio (ver "Pedidos de plataforma simulados
  (Fase 12B)").
- **Cobro y facturación sin conexión** (CU-07): el modo offline solo encola
  pedidos; cobrar requiere red.
- **Réplica de lectura** de base de datos (la propuesta la usa específicamente
  para separar los reportes de la carga transaccional; aquí `ReportsService`
  lee de la misma instancia que todo lo demás).
- **Certificado TLS de una CA real.** Desde la Fase 13B todo entra por Nginx
  con TLS 1.3, HTTP/2 y WSS, pero el certificado es autofirmado.
- **DNS / subdominio por cadena** para multi-tenant en producción (p. ej.
  `lacadena.comandacentral.co`) — en el prototipo el tenant se resuelve por el
  `cadena_id` embebido en el JWT, no por subdominio.
- **Resto de la infraestructura de alta disponibilidad** de la propuesta
  (§5.1): CDN, monitoreo y respaldos. Postgres, Redis y Nginx son una sola
  instancia. El proxy inverso con límite de tasa y las dos instancias de
  backend balanceadas sí existen desde la Fase 13B (ver "Proxy inverso y dos
  instancias (Fase 13B)"). La cola de mensajes + trabajador asíncrono y el almacén de
  objetos sí existen desde la Fase 11B (ver "Documento fiscal en segundo
  plano").
- **SSH (solo con llaves), NTP y Syslog centralizado** (§5.2 de la
  propuesta) — protocolos de operación de servidores de producción; no
  aplican a un prototipo que corre en Docker local.
- **Entrega real de correo.** Desde la Fase 14B el worker envía por SMTP,
  pero a Mailpit, que los muestra en su bandeja web y no los entrega (ver
  "Correo: comprobante y resumen diario (Fase 14B)").

## Diferencias con el ER completo de la propuesta (§6.2)

El ER de la propuesta tiene más entidades y campos que el `schema.prisma` de
este prototipo (ver `backend/prisma/schema.prisma`). Diferencias, todas
intencionales por alcance:

- **`Insumo`, `Receta` y `MovimientoInventario` existen desde la Fase 11**
  (ronda 2, §6.2, ver `docs/fases-siguientes-2.md`). Vender un producto con
  receta definida descuenta inventario automáticamente; ver la sección
  "Inventario y recetas (Fase 11)" más abajo.
- **`Cliente`** existe desde la Fase 8B, solo para los pedidos de domicilio
  y, desde la 12B, de plataforma (nombre, teléfono, dirección); un pedido en
  mesa sigue sin cliente. La Fase 14B le agrega `email` opcional, que el ER no
  tiene, para enviar el comprobante.
- **`Pedido.canal`** acepta `SALON`, `DOMICILIO` y, desde la Fase 12B,
  `PLATAFORMA` (enum `CanalPedido`).
- **`IntegracionPlataforma`** (Fase 12B) no está en el ER: guarda cada
  plataforma conectada a una cadena (hash de la API key y webhook de acuse).
  `Pedido` gana `integracionId` y `referenciaExterna` (únicos en pareja).
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
  hacer idempotentes los reintentos y el `POST /sync` del modo offline.
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
- Hasta la Fase 11B, `estadoDian` quedaba fijo en `SIMULADO` y `urlXml` en
  `null` (esos documentos viejos conservan ese estado). Desde la 11B ver
  "Documento fiscal en segundo plano" más abajo.

## Documento fiscal en segundo plano (Fase 11B)

§5.1 pide un trabajador asíncrono con cola de mensajes para que "la caja
nunca espere a un servicio externo", y §6.3 que "la validación DIAN ocurre en
segundo plano sin bloquear la caja". Así quedó:

- `POST /pagos` crea el documento en `PENDIENTE` y, **después** de confirmar
  la transacción, lo encola en BullMQ (sobre el mismo Redis del backplane de
  Socket.IO) sin esperar el encolado. Si Redis falla, el cobro ya quedó: el
  documento sigue `PENDIENTE` y el worker lo re-encola al arrancar (el
  `jobId` es el id del documento, así que no se duplica).
- El contenedor `worker` (misma imagen y código del backend, entrada
  `src/worker.ts`) toma cada trabajo y:
  - genera un XML propio y mínimo, sin firma (no es UBL 2.1);
  - lo sube a MinIO (almacén de objetos S3, §5.1) y guarda en `urlXml` la URI
    `s3://bucket/llave`;
  - lo "valida" contra `ProveedorDianSimuladoService`.
- El simulador tiene latencia, tasa de caída y tasa de rechazo configurables
  por `.env` (`DIAN_SIMULADA_*`):
  - Una caída es un error técnico: BullMQ reintenta con backoff exponencial
    (`COLA_FISCAL_INTENTOS`, 5 por defecto). Si se agotan los intentos, el
    documento queda `RECHAZADO_SIMULADO` con el motivo.
  - Un rechazo es una respuesta de negocio y no se reintenta.
- Al terminar, el backend recibe el evento `completed` de la cola y emite
  `documento:actualizado` a `sede:{id}`; `/caja` actualiza el recibo en vivo.
- El navegador no habla con MinIO: `GET /documentos-fiscales/:id/xml`
  (CAJERO/ADMIN, con aislamiento por cadena) descarga el XML.
- `// DECISIÓN DE PROTOTIPO`: MinIO corre con la imagen congelada
  `bitnamilegacy/minio`, porque MinIO dejó de publicar `minio/minio` en Docker
  Hub. Es el mismo servidor, sin actualizaciones.

## Pedidos de plataforma simulados (Fase 12B)

CU-05 pide que "un pedido de Rappi entra automáticamente por API al mismo
tablero de la sede, sin re-digitación", y §5.1 que la comunicación con Rappi
vaya por el worker. Así quedó:

- `IntegracionPlataforma` une una plataforma a una cadena. La plataforma se
  autentica con `X-Api-Key`; en la base solo queda el hash SHA-256 de la
  llave. La cadena sale de la integración, nunca del cuerpo.
- `GET /integraciones/plataformas/catalogo`: sedes y productos activos, para
  que la plataforma arme su menú.
- `POST /integraciones/plataformas/pedidos`: traduce el formato de la
  plataforma (`orderId`, `storeId`, `customer`, `items[].sku/qty`) a un
  `Pedido` de canal `PLATAFORMA` en `EN_PREPARACION`, con un `Cliente`, y
  emite `comanda:nueva`. Cocina y caja lo muestran como
  "Plataforma · {orderId}".
- Idempotencia: `(integracionId, referenciaExterna)` es único. Un reenvío
  devuelve el mismo pedido con `duplicate: true`; dos reenvíos simultáneos
  también (el segundo choca con el índice y devuelve el del primero).
- Acuse: después de crear el pedido se encola un trabajo en la cola
  `plataformas` (BullMQ). El worker hace `POST` al webhook `urlAcuse` de la
  integración con el pedido aceptado; si no responde 2xx, reintenta con
  backoff (`COLA_PLATAFORMAS_INTENTOS`). El pedido ya está en cocina pase lo
  que pase con el acuse.
- `// DECISIÓN DE PROTOTIPO`: la plataforma es un simulador.
  - Formato JSON propio (en inglés), a propósito distinto del de Comanda. No
    copia la API de Rappi: no hay acceso aprobado y está prohibido integrarla.
  - La página `/simulador-plataforma` (sin sesión, con la API key del `.env`)
    manda pedidos, tiene un botón para reenviar el último y muestra los
    acuses.
  - El webhook de acuses del simulador vive en el propio backend
    (`/simulador-plataforma/:integracionId/acuses`) y guarda los acuses en
    Redis; en producción el webhook sería de la plataforma.
  - El seed crea la integración demo con `PLATAFORMA_SIMULADA_API_KEY`.
- `// TODO PRODUCCIÓN`: rotación de API keys y firma HMAC de pedidos y
  acuses.

## Proxy inverso y dos instancias (Fase 13B)

§5.1 pide un "punto único de entrada: terminación TLS 1.3, HTTP/2,
compresión, límite de tasa y balanceo" y "dos instancias ... para tolerancia
a fallos"; §5.2 pide HTTPS y WSS. Así quedó:

- Contenedor `nginx` (`nginx/`), en `https://localhost:8443`:
  - `/api/...` va a `backend-1`/`backend-2` sin el prefijo; `/socket.io/`
    con upgrade a WSS; `/` al servidor de Vite (incluido su HMR).
  - Solo TLS 1.3, HTTP/2 y gzip. El log muestra qué instancia atendió cada
    petición.
  - `limit_req` en `/api/menu/` y `/api/public/`: 5 peticiones/s por IP con
    ráfaga de 10; al pasarse responde `429`.
- Balanceo:
  - La API va en round robin. Socket.IO usa `ip_hash`, porque el handshake
    por long-polling necesita llegar siempre a la misma instancia.
  - Si una instancia se cae, Nginx la saca del balanceo (`max_fails`, y
    `resolve` re-resuelve el DNS de Docker cada 5 s) y los sockets se
    reconectan a la otra en ~1 s. Los eventos emitidos en una instancia
    llegan a los sockets de la otra por el backplane de Redis (Fase 4).
  - `documento:actualizado` es la excepción: lo emiten todas las instancias
    (cada una recibe el `completed` de la cola), así que cada una lo manda
    solo a sus propios sockets (`server.local`) para no duplicarlo.
- El frontend llama a la API por rutas relativas (`VITE_API_URL=/api`, socket
  en el mismo origen). Entrando directo a Vite (`:5173`), su `server.proxy`
  hace lo mismo que Nginx, sin TLS. El service worker (9B) no cachea `/api/`
  ni `/socket.io/`, que ahora son del mismo origen.
- Con HTTPS, el service worker de la 9B funciona también desde un teléfono en
  la red local (`NGINX_CERT_IP` en el `.env`).
- `// DECISIÓN DE PROTOTIPO`:
  - El certificado es autofirmado. Lo genera el contenedor al arrancar
    (`nginx/generar-certificado.sh`) y vive en un volumen, no en el repo.
  - `backend-1` sigue publicado en `:3000` para Swagger y depuración.
  - Las dos instancias responden al alias de red `backend`, así que lo
    interno (worker → webhook del simulador, proxy de Vite) no cambió.
  - Cada instancia compila a su propia carpeta (`dist/`, `dist-2/`), porque
    comparten el bind mount de `./backend`.
- Probado: con `backend-1` detenido la API y los eventos siguen por
  `backend-2`, y un KDS conectado a la instancia que se detiene se reconecta
  y sigue recibiendo comandas.

## Correo: comprobante y resumen diario (Fase 14B)

§5.2 pide "SMTP: envío de comprobantes al comensal y resúmenes diarios al
dueño". Así quedó:

- Contenedor `mailpit`: servidor SMTP local con bandeja web
  (http://localhost:8025). El worker le habla por SMTP con `nodemailer`
  (variables `SMTP_*`); en producción bastaría apuntarlas a un relay real.
- Cola `correo` (BullMQ) con reintentos y backoff (`COLA_CORREO_INTENTOS`).
  El backend solo encola; envía el contenedor `worker` (`MailWorkerModule`).
- Comprobante:
  - El formulario de domicilio pide un correo opcional (`Cliente.email`,
    migración `r2p2_cliente_email`, `// DECISIÓN DE PROTOTIPO`).
  - Cuando la DIAN simulada deja el documento de un domicilio en
    `VALIDADO_SIMULADO`, el worker fiscal encola el comprobante (`jobId` fijo,
    así un reintento no manda dos). Sin correo, no se envía nada.
  - El correo dice que el documento es simulado y no tiene validez fiscal.
- Resumen diario:
  - Trabajo repetible de BullMQ (`RESUMEN_DIARIO_CRON`, 23:00 en
    `RESUMEN_DIARIO_ZONA`, Bogotá): un correo por cadena a todos sus ADMIN,
    con el consolidado de la Fase 9 (`ReportsService.consolidado`) del día.
  - `POST /correo/resumen-diario` (solo ADMIN, `fecha` opcional) lo dispara
    a mano para la cadena del ADMIN; en `/panel` es el botón "Enviar resumen
    del día por correo".
  - El worker registra `ReportsService` y `BranchesService` como proveedores
    propios en vez de importar `ReportsModule`, que trae controladores con
    guards de JWT que el worker no tiene.
  - Mientras el consolidado cuente el día en UTC, el resumen de las 23:00 de
    Bogotá corresponde al día UTC de esa fecha; coinciden cuando la Fase 14
    (Parte 1) pase el reporte a la zona de Bogotá.
- `// TODO PRODUCCIÓN`: relay SMTP con TLS y autenticación, SPF/DKIM, y
  baja de suscripción del resumen.

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

## Inventario y recetas (Fase 11, ronda 2, §6.2)

- `InventoryModule` (`backend/src/inventory/`) agrega `Insumo` (catálogo de
  insumos de la cadena), `Receta` (PK compuesta `productoId`+`insumoId`: cuánto
  insumo necesita una unidad de un producto) y `MovimientoInventario`
  (`ENTRADA`/`SALIDA`/`MERMA` por sede).
- No hay columna de stock: la existencia de un insumo en una sede es la suma
  de sus movimientos (`GET /sedes/:id/inventario`, calculado en memoria, igual
  que `ReportsService` con los pagos). `ENTRADA`/`MERMA` se registran a mano
  (`POST /inventario/movimientos`, solo ADMIN); `SALIDA` solo la genera
  `PaymentsService.pagar`, nunca el endpoint manual.
- `PaymentsService.pagar` descuenta inventario **dentro de la misma
  transacción** del cobro: por cada detalle del pedido, busca la receta de su
  producto y crea un `MovimientoInventario` de tipo `SALIDA` por cada insumo
  (cantidad de la receta × cantidad del detalle). Si un producto no tiene
  receta definida, simplemente no genera movimientos — no todos los productos
  demo la necesitan (ver seed).
- `// DECISIÓN DE PROTOTIPO`: si una existencia queda negativa, **no se
  bloquea el cobro** — el saldo negativo queda visible en `/inventario` como
  alerta para ADMIN. La propuesta no fija qué hacer en ese caso; bloquear la
  venta habría acoplado caja a la disponibilidad de insumos, que esta demo no
  modela con la granularidad (mermas, proveedores) que ameritaría esa regla.
- CRUD mínimo: `POST`/`GET`/`PATCH /insumos` y `GET`/`PUT /productos/:id/receta`
  (el `PUT` reemplaza la receta completa del producto, más simple que exponer
  un endpoint por ítem), todos `@Roles('ADMIN')`.
- Tiempo real: evento nuevo `inventario:actualizado` a la room
  `cadena:{cadenaId}` (movimiento manual o descuento automático por venta).
  `/inventario` lo escucha con `useInventarioSocket` (calcado de
  `useVentasSocket`: el backend ya une todo socket autenticado a la room de su
  cadena al conectarse, no hace falta unirse a una sede).
- Frontend: página `/inventario` (solo ADMIN) con tres secciones — insumos
  (CRUD), existencias de la sede activa (con movimiento manual por insumo) y
  receta de un producto. No abre su propio selector de sede: confía en el
  mismo `SelectorSedeGlobal` que ya usan `/mesas` y `/caja`.
- Seed: 6 insumos y receta en 4 de los 8 productos demo (Hamburguesa, Pizza,
  Papas Fritas, Gaseosa), con una `ENTRADA` inicial de 10000 por insumo en
  cada una de las 3 sedes para que la demo no arranque en cero.

## Row Level Security (Fase 12, ronda 2, §6.1)

- **Rol sin privilegios de dueño** (`comanda_app`, migración `r2p1_rol_app`).
- **Migración `r2p1_rls`**: `ENABLE` + `FORCE ROW LEVEL SECURITY` en las 13
  tablas de negocio más `integraciones_plataforma`, con una política
  `aislamiento_cadena` (`FOR ALL`, `USING` y `WITH CHECK`) para `comanda_app`
  que compara contra `current_setting('app.cadena_id', true)`. Sin esa
  variable, el rol de la app no ve ni escribe ninguna fila.
- **Decisión de prototipo — EXISTS en vez de `cadena_id` denormalizado** para
  `mesas`, `pedidos`, `pedido_detalles`, `pagos`, `documentos_fiscales`,
  `movimientos_inventario` y `recetas`: la política hace `EXISTS` contra el
  padre (`sedes`, `pedidos` o `productos`). La propuesta dice que todas las
  tablas de negocio llevan `cadena_id` y la columna sería lo más fiel, pero
  obligaría a tocar cada INSERT (incluido el código de Parte 2) y a mantener
  un campo redundante; con `EXISTS` el esquema y la escritura quedan intactos.
  `TODO PRODUCCIÓN`: denormalizar e indexar `cadena_id` con volúmenes reales.
- **Política `dueno_total`**: como `FORCE` también aplica al dueño, cada tabla
  tiene una política que le da acceso total al rol dueño (el que corre
  migraciones y seed, y las consultas previas a conocer la cadena: login por
  email, API key de plataforma). `comanda_app` nunca la cumple.
- **`PrismaService.conCadena(cadenaId, fn)`**: segundo cliente Prisma conectado
  como `comanda_app` (`DATABASE_URL_APP`) que abre una transacción, ejecuta
  `set_config('app.cadena_id', cadenaId, true)` (local a la transacción, no
  sobrevive en el pool) y corre `fn(tx)`. Lo usan los servicios de negocio
  (sedes, catálogo, inventario, reportes, pagos, mesas, pedidos, menú público,
  domicilio, sync vía pedidos) y los procesadores del worker con la `cadenaId`
  del payload del job. Los filtros explícitos por `cadenaId` siguen en el
  código como segunda capa.
- **Quedan en el cliente dueño** (a propósito, funcionan por `dueno_total`):
  login por email, resolución de `X-Api-Key`, `reencolarPendientes` y la lista
  de cadenas del resumen diario — lookups previos a conocer la cadena.
- **Prueba de aislamiento** (`backend/test/rls-aislamiento.spec.ts`, vitest):
  crea dos cadenas con el rol dueño y verifica con `comanda_app` que (1) sin
  `app.cadena_id` no se ve ninguna fila, (2) con la cadena A no aparecen filas
  de la B (incluida `mesas`, con política `EXISTS`), (3) insertar una fila de
  otra cadena falla por `WITH CHECK` y (4) un `UPDATE` no alcanza filas ajenas.
  Corre contra la base real y limpia lo que crea:
  `docker compose run --rm backend-1 npx vitest run test/rls-aislamiento.spec.ts`.

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
