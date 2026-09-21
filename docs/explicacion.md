# Explicación completa del prototipo — guía para sustentar

Este documento explica **cada herramienta y cada pieza** de este proyecto,
desde cero, para que puedas defenderlo sin necesitar saber programación de
antemano. Está escrito para leerse de arriba a abajo, pero también puedes
saltar directo a la sección que te preocupe.

Si algo aquí no coincide con lo que ves en el código, el código manda —
avísame para corregir este documento.

---

## 1. El panorama general, en una frase

**Comanda** es una aplicación web con dos partes que se hablan por internet:
una parte que el usuario ve y toca en el navegador (el **frontend**), y una
parte invisible que guarda los datos y hace las cuentas (el **backend**).
Ambas corren dentro de "cajas" llamadas **contenedores**, junto con la base
de datos y una pieza de mensajería en tiempo real (**Redis**). Todo esto en
tu propia computadora, simulando cómo correría en un servidor real de
internet.

Piensa en un restaurante de verdad:

- El **mesero** usa una pantalla (`/mesas`) para tomar el pedido.
- Ese pedido aparece **al instante** en la pantalla de **cocina** (`/cocina`),
  sin que nadie tenga que refrescar la página — como un timbre que suena
  solo.
- Cuando cocina termina, **caja** (`/caja`) ve que la mesa ya está lista para
  cobrar, cobra, y se genera un recibo (documento fiscal simulado).

Todo este viaje —desde que el mesero aprieta "Enviar comanda" hasta que caja
cobra— es lo que este prototipo demuestra funcionando de verdad.

---

## 2. Docker y Docker Compose — la caja donde vive todo

### ¿Qué problema resuelve?

Normalmente, para que un programa funcione, necesitas instalar en tu
computador exactamente las versiones correctas de muchas cosas (el lenguaje
de programación, la base de datos, etc.). Si a alguien más le falta una
pieza o tiene una versión distinta, el programa puede no funcionarle igual
("en mi computador sí funciona" es el chiste clásico de programación).

### La analogía

**Docker** es como empacar todo un mini-computador — con el programa y todo
lo que necesita para correr — dentro de una caja sellada y portátil llamada
**contenedor**. Esa caja funciona igual sin importar en qué computador la
abras, porque lleva todo adentro.

**Docker Compose** es el director de orquesta: en vez de abrir cajas una por
una a mano, lee un archivo (`docker-compose.yml`) que dice "necesito estas
4 cajas, así conectadas entre sí" y las levanta todas juntas con un solo
comando: `docker compose up`.

### Las 4 cajas (contenedores) de este proyecto

| Contenedor | Qué es | Para qué sirve aquí |
|---|---|---|
| `comanda-backend` | El servidor de la aplicación (NestJS) | Recibe peticiones, aplica las reglas del negocio, habla con la base de datos |
| `comanda-frontend` | El servidor de desarrollo de la interfaz (Vite) | Le entrega al navegador la página web que ves |
| `comanda-postgres` | La base de datos (PostgreSQL) | Guarda permanentemente cadenas, sedes, usuarios, pedidos, pagos, etc. |
| `comanda-redis` | Una base de datos en memoria (Redis) | Sirve de "buzón" para que los mensajes en tiempo real lleguen a todos los que están conectados |

**Por qué se usa aquí:** el documento de propuesta pide que el sistema corra
como un servicio en la nube (varios servidores hablándose por red). Docker
deja simular esa misma separación de piezas en un solo computador, y es
justo lo que se explica en la sustentación: "esto que ves como 4 cajas
locales, en producción serían 4 servidores reales conectados por internet".

---

## 3. El Backend — el cerebro que nadie ve

### ¿Qué es un backend?

Es el programa que corre "detrás" de la aplicación, sin interfaz visual.
Recibe peticiones (por ejemplo, "crea este pedido"), decide si son válidas,
las guarda en la base de datos, y responde. El navegador nunca habla
directo con la base de datos — siempre pasa por el backend, que actúa como
un portero que aplica las reglas.

### NestJS y TypeScript

- **TypeScript** es el lenguaje de programación en el que está escrito el
  backend. Es una versión de JavaScript (el lenguaje más común de la web) a
  la que se le agregaron "tipos": obliga a decir de antemano qué forma tiene
  cada dato (por ejemplo, "esto es un texto", "esto es un número"), lo cual
  ayuda a detectar errores antes de que el programa corra.
- **NestJS** es un *framework* (una caja de herramientas con reglas ya
  definidas) para construir el backend en TypeScript de forma organizada.
  Nest obliga a separar el código en piezas pequeñas y predecibles:

  - **Controlador** (`*.controller.ts`): define qué URLs existen y qué hacen
    (por ejemplo, "cuando llegue una petición a `/pedidos`, hacer esto").
  - **Servicio** (`*.service.ts`): tiene la lógica real — las reglas del
    negocio, los cálculos, las validaciones.
  - **Módulo** (`*.module.ts`): agrupa un controlador con su servicio y con
    todo lo que necesitan, como una carpeta con todo lo de un mismo tema.

### Los módulos de este proyecto (y qué hace cada uno)

| Módulo | Qué controla |
|---|---|
| `AuthModule` | Login, y "quién eres" en cada petición (ver JWT más abajo) |
| `BranchesModule` | Las sedes de un restaurante y sus mesas |
| `CatalogModule` | El catálogo de productos (el menú) |
| `TablesModule` | El estado de cada mesa (libre / ocupada) |
| `OrdersModule` | Los pedidos: crearlos, consultarlos, cambiar su estado |
| `PaymentsModule` | Cobrar un pedido y generar el documento fiscal |
| `RealtimeModule` | El canal de tiempo real (WebSocket) |
| `ReportsModule` | El reporte de ventas del día |

Que esté dividido en módulos así se llama **"monolito modular"**: es un solo
programa (no está repartido en 8 servidores distintos), pero organizado por
dentro como si algún día pudiera separarse en piezas independientes sin
tener que reescribirlo todo. Es una decisión intermedia entre "todo
mezclado" y "microservicios" (servicios separados de verdad), que se
justifica porque el volumen de este prototipo no necesita esa complejidad
extra todavía.

### ¿Qué es una API REST?

Una **API** es la manera en que dos programas se hablan (en vez de dos
personas). **REST** es un estilo de organizar esa conversación usando el
protocolo HTTP (el mismo que usa tu navegador para pedir páginas web), con
reglas simples:

- Cada "cosa" del sistema tiene una dirección (URL). Ejemplo: `/pedidos`.
- El **verbo HTTP** dice qué acción se quiere hacer sobre esa dirección:
  - `GET` = consultar ("dame la lista de mesas")
  - `POST` = crear ("crea este pedido nuevo")
  - `PATCH` = modificar algo puntual ("cambia el estado de este pedido")

Por ejemplo: `POST /pedidos` crea un pedido nuevo; `GET /sedes/:id/mesas`
consulta las mesas de una sede.

---

## 4. La base de datos — donde todo se guarda de verdad

### PostgreSQL: una base de datos relacional

Una **base de datos** es donde la información queda guardada de forma
permanente (si apagas el computador, sigue ahí). **PostgreSQL** es un tipo
de base de datos **relacional**: organiza los datos en **tablas** (como
hojas de Excel), donde cada fila es un registro y cada columna es un dato de
ese registro. Las tablas se **relacionan** entre sí por medio de
identificadores compartidos.

Ejemplo real de este proyecto: la tabla `pedidos` tiene una columna
`mesa_id` que apunta a un registro específico de la tabla `mesas`. Así, cada
pedido "sabe" a qué mesa pertenece sin tener que repetir toda la
información de la mesa dentro del pedido.

**Por qué una base relacional y no otra cosa:** una venta en este sistema
tiene que actualizar varias cosas a la vez (el pedido, el pago, el
documento fiscal, la mesa) y **todo debe quedar bien o no quedar nada** — si
a mitad de camino algo falla, no puede quedar "a medias" (por ejemplo, que
se cobre pero la mesa no se libere). Esta garantía se llama **transacción
ACID**, y es exactamente lo que las bases relacionales como PostgreSQL
ofrecen de forma nativa. Puedes ver esta garantía en
`backend/src/payments/payments.service.ts`, donde crear el pago, generar el
documento fiscal, actualizar el pedido y liberar la mesa ocurre todo dentro
de un único `$transaction`.

### Las tablas de este prototipo

`cadenas` (la empresa dueña, ej. una cadena de restaurantes) → `sedes` (cada
local) → `mesas`, `productos`, `usuarios` → `pedidos` → `pedido_detalles`
(los ítems de cada pedido) → `pagos` y `documentos_fiscales`.

### Prisma: el traductor entre TypeScript y la base de datos

El backend está escrito en TypeScript, pero la base de datos "habla" en
**SQL** (el lenguaje de consultas de las bases de datos relacionales).
**Prisma** es una herramienta que traduce entre los dos mundos: en el código
escribes cosas como `prisma.pedido.create({...})` y Prisma genera y ejecuta
el SQL correspondiente por debajo. Esto se llama un **ORM** (mapeador
objeto-relacional).

El "plano" de las tablas vive en un solo archivo,
`backend/prisma/schema.prisma`. Cuando ese plano cambia, se genera una
**migración**: un archivo con las instrucciones SQL exactas para llevar la
base de datos real de su forma actual a la nueva forma. Las migraciones
quedan guardadas en `backend/prisma/migrations/`, como un historial de
cambios a la estructura de la base de datos.

### Multi-tenant: varios clientes, una sola base de datos

**Multi-tenant** ("multi-inquilino") significa que un solo sistema atiende
a varios clientes distintos (varias cadenas de restaurantes) sin que se
mezclen sus datos. Aquí se logra con una columna `cadena_id` en cada tabla
importante: cada consulta filtra siempre por la cadena del usuario que
inició sesión, así que un empleado de la Cadena A nunca puede ver datos de
la Cadena B.

---

## 5. Autenticación — cómo el sistema sabe quién eres (JWT)

### El problema

HTTP (el protocolo de la web) es "sin memoria": cada petición es
independiente, el servidor no recuerda quién hizo la petición anterior. Si
no se hiciera nada más, tendrías que mandar tu usuario y contraseña en
*cada* clic que haces.

### La solución: JWT (JSON Web Token)

Cuando entras con tu correo y contraseña (`POST /auth/login`), el servidor
verifica que sean correctos y te entrega un **token**: un texto largo y
cifrado que funciona como un brazalete de un concierto. Ese token:

- Dice quién eres, tu rol (mesero/cajero/admin) y a qué cadena perteneces.
- Está firmado digitalmente, así que nadie puede inventarse uno falso ni
  alterarlo sin que el servidor lo note.
- Tu navegador lo guarda (aquí, en `localStorage`) y lo manda en cada
  petición siguiente, en un encabezado llamado `Authorization`.

Así, el servidor no necesita "recordarte": cada vez que le llega una
petición con tu token, lo verifica y ya sabe quién eres, sin volver a
preguntar la contraseña.

### Roles y permisos

Cada usuario tiene un **rol**: `MESERO`, `CAJERO` o `ADMIN`. El backend usa
ese rol para decidir qué puede hacer cada quien — por ejemplo, solo un
mesero (o admin) puede crear un pedido, y solo un cajero (o admin) puede
cobrar. Si un mesero intenta cobrar, el servidor responde "403 Forbidden"
(prohibido), aunque tenga un token válido.

---

## 6. Tiempo real — por qué la comanda aparece "sola" en cocina

Esta es la parte que más tiene que ver con la materia (Servicios
Telemáticos), y la más vistosa de la demo.

### El problema con la forma "normal" de pedir datos

La forma típica en que un navegador consigue datos nuevos es **preguntando**
(HTTP normal): "¿hay pedidos nuevos? ¿y ahora? ¿y ahora?" cada cierto tiempo.
Esto se llama ***polling***, y tiene un defecto: si preguntas poco seguido,
la comanda tarda en aparecer; si preguntas muy seguido, saturas al servidor
con preguntas la mayoría de las veces innecesarias (casi nunca hay algo
nuevo).

### La solución: WebSocket

Un **WebSocket** es una conexión que se abre una sola vez y se queda
abierta, como una llamada telefónica en vez de mandar cartas. Con esa línea
abierta, el **servidor puede hablar primero**: en el momento en que se crea
un pedido, el servidor **empuja** ese dato a todas las pantallas de cocina
conectadas, sin que ellas tengan que preguntar nada. Por eso la comanda
"aparece sola".

En este proyecto, la librería que maneja esto es **Socket.IO**
(`backend/src/realtime/realtime.gateway.ts`). Cada sede tiene su propio
"salón" (`room`) llamado `sede:{id}`; solo los usuarios de esa sede
(verificado con su token) reciben los eventos de esa sede.

Los dos eventos que viajan por este canal:

- `comanda:nueva` — se dispara cuando el mesero envía un pedido; lo escucha
  la pantalla de cocina.
- `pedido:actualizado` — se dispara cuando cambia el estado de un pedido
  (por ejemplo, a `LISTO` o `PAGADO`); lo escuchan mesero y caja.

### ¿Y Redis, para qué sirve aquí?

**Redis** es una base de datos que guarda todo en memoria (por eso es
extremadamente rápida, aunque no es para guardar datos para siempre). Aquí
se usa como el "canal de radio" (**Pub/Sub**, de *publish/subscribe*) detrás
del WebSocket: el servidor "publica" un evento en Redis, y Redis se encarga
de repartirlo a quien esté "suscrito".

En este prototipo, con un solo servidor, Redis no es *estrictamente*
necesario para que funcione. Se incluye a propósito para demostrar el
patrón real de producción: si algún día hubiera **varias copias** del
backend corriendo al mismo tiempo (para aguantar más usuarios), cada copia
solo sabría de los clientes conectados a ella misma — Redis es lo que
permite que un evento publicado en la copia A también le llegue a un
cliente conectado a la copia B.

---

## 7. El Frontend — lo que el usuario ve y toca

### React

**React** es una librería de JavaScript para construir interfaces web
armándolas con piezas reutilizables llamadas **componentes**. Cada pantalla
de este proyecto (`Login`, `Mesas`, `Cocina`, `Caja`, `Home`) es un
componente: una función que describe "con estos datos, muéstrame esto en
pantalla".

React se encarga de la parte tediosa: cuando un dato cambia (por ejemplo,
llega un pedido nuevo por WebSocket), React actualiza automáticamente solo
la parte de la pantalla que debe cambiar, sin que el programador tenga que
mover manualmente pedazos del HTML.

### Vite

**Vite** es la herramienta que, durante el desarrollo, toma el código de
React/TypeScript y se lo sirve al navegador, recompilándolo al vuelo cada
vez que se guarda un cambio (eso se llama *hot reload*: ves el cambio en la
pantalla sin recargar la página a mano). En producción, Vite empaquetaría
todo en archivos optimizados para servirlos rápido.

### ¿Qué es una SPA?

Este frontend es una **SPA** (*Single Page Application*, aplicación de una
sola página): el navegador carga una sola página HTML al principio, y luego
todo lo que "parece" ser una página distinta (`/mesas`, `/cocina`, `/caja`)
en realidad es la misma página cambiando qué componente muestra, sin
recargar por completo. Eso lo maneja la librería `react-router-dom`.

### El cliente de WebSocket

El frontend usa `socket.io-client` (el "hermano" de Socket.IO para el
navegador) para abrir esa conexión persistente con el backend. Se ve en
`frontend/src/realtime/useComandaSocket.ts`.

---

## 8. Documentación de la API — Swagger

**Swagger** (accesible en este proyecto en `http://localhost:3000/api/docs`)
es una página web que se genera **automáticamente** a partir del propio
código del backend, y muestra:

- Todos los endpoints que existen (`GET /sedes`, `POST /pedidos`, etc.).
- Qué datos espera recibir cada uno y qué devuelve.
- Un botón para probarlos ahí mismo, sin necesitar Postman ni la terminal.

Sirve como la "carta de restaurante" de la API: cualquiera que necesite usar
el backend (por ejemplo, otro desarrollador de frontend) puede leerla sin
tener que abrir el código fuente.

---

## 9. El viaje completo de una comanda (para explicar la demo)

Esto es lo que puedes narrar paso a paso en la sustentación, ya sabiendo qué
hace cada pieza:

1. **El mesero entra** a `/login`, escribe su correo y contraseña → el
   backend valida contra la tabla `usuarios` (la contraseña está guardada
   **cifrada**, con `bcrypt`, nunca en texto plano) y devuelve un **JWT**.
2. El mesero va a `/mesas`. El frontend pide (`GET`) las mesas y el
   catálogo de productos, y **abre una conexión WebSocket** a la sede.
3. El mesero toca una mesa libre, arma el carrito, y presiona **"Enviar
   comanda"** → el frontend manda `POST /pedidos` con un identificador único
   (**UUID**) que generó él mismo (útil para que un reintento por mala
   conexión nunca duplique el pedido — se llama **idempotencia**).
4. El backend guarda el pedido en PostgreSQL, marca la mesa como
   **OCUPADA**, y **publica el evento `comanda:nueva`** por el canal de
   Redis/WebSocket.
5. La pantalla de **cocina**, que ya estaba con su WebSocket abierto,
   **recibe ese evento al instante** y muestra la tarjeta del pedido — sin
   que nadie haya recargado nada.
6. Cocina presiona **"Marcar LISTO"** → `PATCH /pedidos/:id/estado` → el
   backend valida que el cambio de estado sea válido (no se puede saltar de
   `EN_PREPARACION` a `PAGADO`, por ejemplo) y publica `pedido:actualizado`.
7. La pantalla de **caja**, conectada al mismo canal, ve el pedido pasar a
   "Listos para cobrar" en vivo. El cajero presiona **"Cobrar"**,
   elige el medio de pago, y confirma → `POST /pagos`.
8. El backend, en una sola **transacción**: registra el pago, calcula el
   siguiente número consecutivo del documento fiscal **para esa sede**,
   marca el pedido como `PAGADO`, y libera la mesa (vuelve a `LIBRE`).
9. El evento `pedido:actualizado` llega también a la pantalla del mesero:
   sin recargar, ve la mesa libre otra vez.

---

## 10. Conceptos de Servicios Telemáticos para mencionar en la sustentación

| Concepto | Dónde se ve en este proyecto |
|---|---|
| Arquitectura cliente-servidor | El navegador (cliente) nunca toca la base de datos directo; siempre pasa por el backend (servidor) |
| Protocolo HTTP | Toda la API REST viaja sobre HTTP |
| WebSocket | El canal de tiempo real entre backend y frontend |
| Multi-tenant | Varias cadenas de restaurantes aisladas en la misma base de datos, por `cadena_id` |
| Idempotencia | El UUID del pedido generado por el cliente evita duplicados en reintentos |
| Transacciones ACID | El cobro (pago + documento fiscal + liberar mesa) ocurre todo o nada |
| Autenticación con token (JWT) | Reemplaza mandar usuario/contraseña en cada petición |
| Contenedores (Docker) | Cada pieza del sistema aislada y reproducible |

### Lo que la propuesta original pedía y este prototipo **no** implementa (y por qué)

Es importante decir esto con seguridad en la sustentación — es una decisión
consciente, no un olvido: este prototipo es un **corte vertical**
(*vertical slice*) del producto completo de la propuesta (19 servicios). Se
construyó el camino completo de un flujo (mesero → cocina → caja) en vez de
construir un poco de cada uno de los 19. Quedan fuera, a propósito:

- Integración real con la **DIAN** (el documento fiscal es simulado).
- Integración con **Rappi**, menú QR para comensales, pedidos a domicilio.
- **Modo sin conexión** (offline) con sincronización posterior.
- Panel que consolide **varias sedes/cadenas** a la vez.
- Infraestructura de producción a gran escala: balanceo entre varios
  servidores, CDN, réplica de la base de datos para reportes, HTTPS/TLS
  real (aquí todo corre en HTTP plano porque es local).

El detalle completo de estas decisiones está en
[`docs/prototipo-slice.md`](prototipo-slice.md), y los documentos originales
de la propuesta están en [`docs/propuesta/`](propuesta/).

---

## 11. Glosario rápido

- **Backend**: el programa del servidor, invisible para el usuario.
- **Frontend**: la interfaz que el usuario ve y toca en el navegador.
- **API**: la forma en que dos programas se comunican.
- **REST**: un estilo de API basado en URLs + verbos HTTP (GET/POST/PATCH).
- **Endpoint**: una URL específica de la API (ej. `POST /pedidos`).
- **Base de datos relacional**: guarda datos en tablas conectadas entre sí.
- **ORM**: traductor entre el código y el lenguaje de la base de datos.
- **Migración**: cambio versionado a la estructura de la base de datos.
- **JWT**: un token firmado que identifica a un usuario ya autenticado.
- **WebSocket**: conexión persistente que permite que el servidor empuje
  datos sin que el cliente pregunte.
- **Contenedor / Docker**: un empaquetado portátil de un programa y todo lo
  que necesita para correr.
- **Multi-tenant**: un sistema que atiende a varios clientes sin mezclar
  sus datos.
- **Idempotencia**: repetir la misma operación no produce resultados
  duplicados.
- **Transacción ACID**: un conjunto de cambios a la base de datos que se
  aplican todos juntos o ninguno.

---

## 12. Preguntas típicas que te pueden hacer (y respuestas cortas)

**¿Por qué WebSocket y no simplemente refrescar la página cada 3 segundos?**
Porque preguntar todo el tiempo desperdicia recursos y de todas formas hay
un retraso (hasta 3 segundos) en enterarse. Con WebSocket el servidor avisa
en el instante exacto en que ocurre el evento.

**¿Por qué PostgreSQL y no una base de datos NoSQL (como MongoDB)?**
Porque una venta necesita que varias tablas se actualicen de forma
consistente y "todo o nada" (transacciones ACID), y los reportes se hacen
mejor con consultas SQL sobre datos organizados en tablas. El volumen de
este sistema no justifica sacrificar esa consistencia por la escalabilidad
extra que ofrece NoSQL.

**¿Por qué el prototipo no usa HTTPS?**
Porque corre 100% en tu computador local, sin salir a internet — no hay
tráfico que interceptar. En producción sí sería obligatorio (así lo dice el
README).

**¿Qué pasa si dos meseros intentan ocupar la misma mesa al mismo tiempo?**
El backend valida el estado de la mesa antes de crear el pedido; si ya está
ocupada, responde con un error (409 Conflict) y el segundo intento falla
limpiamente en vez de generar dos pedidos sobre la misma mesa.

**¿Qué es Prisma exactamente, un lenguaje?**
No, es una herramienta (un ORM) que se instala dentro del proyecto de
TypeScript. Tú escribes instrucciones en TypeScript y Prisma las convierte
en SQL para hablar con PostgreSQL.
