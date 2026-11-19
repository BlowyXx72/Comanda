# Comanda — Prototipo local

Prototipo del *vertical slice* central de **Comanda Central** (Servicios
Telemáticos): pedido en mesa → cocina en tiempo real → cobro con documento
fiscal simulado. Ver [`docs/prototipo-slice.md`](docs/prototipo-slice.md) para
el detalle de qué está implementado y qué queda fuera de alcance.

## Requisitos

- Docker + Docker Compose (todo lo demás corre dentro de contenedores)
- Git

No necesitas Node instalado en tu máquina: backend y frontend corren
dockerizados con hot-reload.

### Skill de UI/UX para Claude Code (opcional)

Si trabajas el frontend con Claude Code, instala la skill **UI UX Pro Max**
([nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill),
licencia MIT). Le da a Claude guías de diseño, accesibilidad, paletas y
tipografía para pantallas como `/cocina`, `/caja` o `/mesas`. Se instala una
sola vez por máquina (en `~/.claude/skills`, no dentro del repo) y requiere
Node y Python 3 en la máquina local:

```bash
npx -y ui-ux-pro-max-cli@latest init --ai claude --global
```

Después de instalarla, reinicia Claude Code. Se activa sola en tareas de
interfaz (p. ej. "mejora el diseño de /cocina").

## Cómo levantar el proyecto

```bash
cp .env.example .env
docker compose up -d --wait
docker compose exec backend-1 npx prisma db seed
docker compose exec backend-1 npm run seed:imagenes   # fotos de demo del menú (Fase 16B)
```

`--wait` hace que el comando termine solo cuando todo está listo de verdad
(backend, frontend y nginx tienen healthcheck): si responde, ya se puede
entrar. El seed solo hace falta la primera vez. Las fotos de los productos
se cambian desde `/catalogo` (ADMIN): JPEG, PNG o WebP de hasta 2 MB; el
backend las recorta a 4:3 y las pasa a WebP de 800 y 400 px.

**Al prender el PC o reiniciar Docker Desktop, los contenedores no arrancan
solos** (todos usan `restart: "no"`): hay que correr `docker compose up -d
--wait`. Es a propósito: Docker Desktop no publica bien los puertos de los
contenedores que arranca él mismo al iniciar, y quedaban "Up" pero sin
responder en `localhost`.

Si aun así `localhost` no responde (los contenedores están "Up" pero el
navegador se queda cargando), en Windows suele ser el reenvío de localhost de
WSL (`wslrelay`) tapando los puertos de Docker. Se apaga una vez por máquina
creando `%USERPROFILE%\.wslconfig` con:

```ini
[wsl2]
localhostForwarding=false
```

y después `wsl --shutdown` y abrir Docker Desktop de nuevo. Docker Desktop
publica los puertos con su propio proceso y no necesita ese reenvío.

Esto levanta:

| Servicio | URL | Descripción |
|---|---|---|
| **App (Nginx)** | **https://localhost:8443** | Entrada única: TLS 1.3, HTTP/2, WSS, límite de tasa y balanceo (Fase 13B) |
| Postgres | `localhost:5432` | Base de datos |
| Redis | `localhost:6379` | Caché / Pub-Sub para el WebSocket y colas BullMQ |
| Backend (NestJS) | `backend-1` y `backend-2` (detrás de Nginx); `backend-1` también en http://localhost:3000 | API REST + Gateway WebSocket |
| Worker | — | Colas en segundo plano: DIAN simulada (11B), acuses a plataformas (12B) y correo (14B) |
| MinIO | http://localhost:9001 | Almacén de objetos (XML fiscales) |
| Mailpit | http://localhost:8025 | Bandeja web del SMTP local: comprobantes y resumen diario (Fase 14B) |
| Frontend (React) | http://localhost:5173 | Servidor de Vite (también entra directo, sin TLS) |
| Swagger | http://localhost:3000/api/docs | Documentación interactiva de la API |

El certificado de Nginx es autofirmado (lo genera el contenedor al arrancar
y vive en un volumen, no en el repo): la primera vez el navegador muestra una
advertencia que hay que aceptar. Para entrar desde un teléfono en la red
local, pon la IP de la máquina en `NGINX_CERT_IP` y en `VITE_PUBLIC_URL`
(`https://<ip>:8443`) y recrea el contenedor (`docker compose up -d nginx`).

Las migraciones de Prisma (`prisma migrate deploy`) corren automáticamente
en el servicio de un solo uso `migrar` (Fase 18), antes de que arranquen el
backend y el worker; el seed (`prisma db seed`) es
un paso aparte y solo hace falta correrlo una vez (o de nuevo si quieres
resetear los datos de demo — el script es idempotente, borra y recrea todo).
Desde la Fase 18 el seed se niega a correr con `AMBIENTE=produccion`; los
respaldos diarios (servicio `respaldo`) y la retención de los XML fiscales
están en [`docs/datos-aws.md`](docs/datos-aws.md).

Usuarios de prueba creados por el seed (contraseña de cada uno junto al
correo): `admin@demo.com` / `admin123`, `cajero@demo.com` / `cajero123`,
`mesero@demo.com` / `mesero123`. El seed crea **3 sedes** para la cadena
demo (subdominio `demo`). Desde la Fase 17 cada usuario puede tener una sede
asignada: en el seed, cajero y mesero quedan en la Sede Centro y solo operan
ahí; quien no tiene sede asignada (el ADMIN) ve un selector de sede en la
barra superior y opera en todas. La barra muestra siempre la sede activa.
Los usuarios se crean y se les asigna rol y sede desde `/usuarios` (solo
ADMIN); esos cambios aplican sin volver a iniciar sesión.

Verifica que todo esté sano:

```bash
curl http://localhost:3000/health
# { "status": "ok", "dependencies": { "postgres": "up", "redis": "up" }, ... }
```

`/health` valida Postgres con una consulta real vía Prisma y Redis con un
`PING` real vía `ioredis` (ver `backend/src/health/health.controller.ts`).

## Ver la base de datos (Prisma Studio)

No se levanta solo con `docker compose up`. Para verla/editarla a mano:

```bash
docker compose exec -d backend-1 npx prisma studio --port 5555 --browser none
```

`prisma studio` solo escucha en `127.0.0.1` dentro del contenedor (y no
tiene una bandera para cambiarlo), así que el puerto publicado en
`docker-compose.yml` (`5556`) no llega directo a él. Hace falta un pequeño
proxy HTTP en el medio, que además reescribe el encabezado `Host` (Studio
rechaza con 403 cualquier request cuyo `Host` no coincida con el puerto en
el que arrancó):

```bash
docker compose exec -d backend-1 node -e "
const http = require('http');
http.createServer((req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: 5555,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: 'localhost:5555', origin: 'http://localhost:5555' },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => res.destroy());
  req.pipe(proxyReq);
}).listen(5556, '0.0.0.0', () => console.log('proxy listo'));
"
```

Abre **http://localhost:5556**. Alternativa sin este rodeo: cualquier
cliente de Postgres (DBeaver, TablePlus, pgAdmin, la extensión de Postgres
de VSCode) conectado a `localhost:5432` con las credenciales del `.env`.

## Flujo de la demo

Con dos (o tres) pestañas del navegador abiertas en https://localhost:8443
(o http://localhost:5173, sin TLS):

1. Entra con `mesero@demo.com` → `/mesas`, toca una mesa libre, arma el
   pedido con productos del catálogo y presiona **"Enviar comanda"**.
2. En otra pestaña, entra con cualquier usuario → `/cocina`: la comanda
   aparece **al instante, sin recargar** (WebSocket).
3. En `/cocina`, presiona **"Marcar LISTO"**.
4. En una tercera pestaña, entra con `cajero@demo.com` → `/caja`: la mesa
   aparece en "Listos para cobrar" en vivo. Presiona **"Cobrar"**, elige el
   medio de pago y confirma: se genera el documento fiscal simulado
   (consecutivo por sede) y la mesa vuelve a **LIBRE** — visible de inmediato
   en la pestaña de `/mesas`, sin recargar.

En la pestaña de `/mesas`, cuando cocina marca **"Marcar LISTO"** (paso 3),
la mesa correspondiente se resalta unos segundos y suena un beep para
avisarle al mesero que debe ir a recogerla, sin necesidad de tener esa mesa
abierta en el panel de detalle.

Si el socket se cae y se reconecta, `/mesas`, `/cocina` y `/caja` vuelven a
pedir su lista solas, para no perder las comandas emitidas mientras tanto.

## Otras funcionalidades

Además del flujo principal, el prototipo cubre estos casos de uso adicionales
de la propuesta (detalle completo y estado de cada uno en
[`docs/prototipo-slice.md`](docs/prototipo-slice.md)):

- **Menú QR (CU-03)** — en `/mesas`, cada mesa tiene un botón para mostrar su
  código QR, que apunta a `/menu/:cadenaId/:sedeId?mesa=N`: una vista pública
  (sin login) con el catálogo de esa sede, pensada para el celular del
  comensal.
- **Domicilio web (CU-04)** — desde la vista de menú público, un cliente
  remoto puede hacer un pedido a domicilio sin JWT; llega a `/cocina` de la
  sede correspondiente con la etiqueta "Domicilio" en vez de número de mesa.
- **Panel multi-sede (CU-06)** — `/panel` (solo ADMIN) muestra el consolidado
  de ventas de las 3 sedes de la cadena, agrupado por sede/día/canal,
  actualizado en vivo con cada cobro.
- **Modo offline del mesero (CU-07)** — si el navegador del mesero pierde
  conexión, `/mesas` sigue funcionando con catálogo y mesas en caché
  (IndexedDB) y encola los pedidos nuevos localmente; al reconectar, se
  sincronizan solos contra `POST /sync` (idempotente, no duplica si se
  reenvía el mismo lote).
- **Catálogo centralizado (CU-08)** — `/catalogo` (solo ADMIN) permite
  crear, editar y desactivar productos una sola vez; el cambio llega en vivo a
  `/mesas` de las 3 sedes, sin recargar, y el menú QR lo muestra la próxima
  vez que se abre (es público y no mantiene un socket). Desde la Fase
  16B cada producto puede llevar foto, que se ve en el catálogo y en el menú
  QR.
- **Inventario y recetas (Fase 11, §6.2)** — `/inventario` maneja insumos,
  recetas por producto y movimientos; la comanda descuenta inventario por
  receta al entrar a cocina y las existencias se actualizan en vivo.
- **Reportes (Fases 13–14)** — ventas por día/mes, producto y franja horaria
  (zona America/Bogota), leídas de la réplica de lectura de Postgres.
- **Documento fiscal en segundo plano (Fase 11B)** — al cobrar, un worker
  valida el documento contra una DIAN **simulada** y guarda el XML en MinIO;
  `/caja` ve el resultado en vivo y puede descargar el XML.
- **Pedidos de plataformas (CU-05, Fase 12B)** — `/simulador-plataforma`
  imita una plataforma de domicilios que manda pedidos por API con
  `X-Api-Key` (no hay integración con Rappi real).
- **Correo (Fase 14B)** — comprobante del pedido a domicilio y resumen diario
  de ventas, entregados a Mailpit (http://localhost:8025).
- **Cobro sin conexión (CU-07, Fase 16)** — la caja puede cobrar sin red con
  un bloque de consecutivos fiscales reservado; el cobro se sincroniza por
  `POST /sync` al volver la red.
- **Gestión de usuarios** — `/usuarios` (solo ADMIN) crea meseros y cajeros,
  les asigna sede, cambia rol o contraseña y los desactiva (baja lógica).
- **Subdominio por cadena (Fase 20B, §5.2)** — por el subdominio de la
  cadena, el menú QR, el domicilio y el login quedan restringidos a esa
  cadena (se activa con `URL_PUBLICA_CADENA`).

## Pruebas

Con el stack arriba (`docker compose up -d --wait`):

```bash
# Pruebas automáticas del backend (unitarias + integración contra la base)
docker compose exec backend-1 npx vitest run

# Prueba de punta a punta por Nginx: mesa → cocina → cobro → XML fiscal,
# plataforma y su reenvío, domicilio con correo, resumen diario, panel y
# límite de tasa. Necesita el seed. Termina en "TODO OK" o lista lo que falló.
docker compose exec -e NODE_TLS_REJECT_UNAUTHORIZED=0 backend-1 node scripts/prueba-integracion.mjs

# Lint
docker compose exec backend-1 npm run lint
docker compose exec frontend npm run lint
```

## Ambiente de producción (beta en AWS)

Desde la Fase 17B hay imágenes de producción (`backend/Dockerfile`,
`nginx/Dockerfile.prod` con el frontend compilado) y un
`docker-compose.prod.yml` sin bind mounts, sin MinIO ni Mailpit (S3 y SES por
variables) y que solo publica 80 y 443. Las migraciones corren una vez en el
servicio `migrate`, nunca el seed. Para probarlo en el PC antes de subirlo:

```bash
cp .env.prod.example .env.prod   # completar (para probar, sirven valores de prueba)
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod up -d --build --wait
# -> https://localhost:9443   (bajar: ... down -v)
```

Documentación del despliegue en AWS (EC2, TLS, DNS, S3, SES, CloudWatch):

- [`docs/tutorial-migracion-aws.md`](docs/tutorial-migracion-aws.md) — tutorial
  paso a paso con el plan gratuito.
- [`docs/despliegue-aws.md`](docs/despliegue-aws.md) — referencia del
  despliegue (Fases 18B–21B).
- [`docs/datos-aws.md`](docs/datos-aws.md) — respaldos y retención de datos.
- [`docs/runbook.md`](docs/runbook.md) — operación y qué hacer ante alertas.

### CI/CD (GitHub Actions, Fase 18B)

- **`CI`** (`.github/workflows/ci.yml`), en cada PR y en cada push a `main`:
  - lint, tipos y pruebas unitarias del backend;
  - lint y `vite build` del frontend;
  - el stack completo con Docker Compose: seed, todas las pruebas y la prueba
    de punta a punta por Nginx;
  - en los PR, además, comprueba que las imágenes de producción compilan.
- **`Despliegue`** (`.github/workflows/despliegue.yml`), cuando el CI de
  `main` queda en verde:
  - publica `comanda-backend`, `comanda-backend-migrate` y `comanda-nginx` en
    GitHub Container Registry (`ghcr.io/blowyxx72/...`);
  - si la variable del repo `DESPLIEGUE_HABILITADO` es `true`, actualiza la
    EC2 con `deploy/desplegar.sh` por AWS Systems Manager. Entra por OIDC,
    sin llaves de AWS ni SSH.
- Para que un PR en rojo no se pueda integrar: Settings → Branches → regla
  para `main` con "Require status checks to pass" (Backend, Frontend,
  Integración).

## Estructura del repositorio

```
comanda/
├── docker-compose.yml               # desarrollo local
├── docker-compose.prod*.yml         # producción (local de prueba y AWS)
├── .env.example / .env.prod.example
├── .github/workflows/               # CI y despliegue (Fase 18B)
├── backend/                         # NestJS (monolito modular) + worker
│   ├── prisma/                      # esquema, migraciones y seed
│   └── scripts/                     # prueba de integración de punta a punta
├── frontend/                        # React + Vite + TS
├── nginx/                           # proxy TLS local y de producción
├── postgres/                        # réplica de lectura y respaldos
├── deploy/                          # scripts de la EC2, IAM y CloudWatch
└── docs/
    ├── prototipo-slice.md           # alcance: propuesta vs. prototipo
    ├── fases-siguientes*.md         # plan de cada ronda
    ├── propuesta/                   # documentos fuente de la propuesta
    └── ...                          # despliegue, runbook, evidencias
```

## Servicios telemáticos usados y por qué

Este prototipo es la materia de la asignatura, así que cada pieza de
infraestructura corresponde a un concepto telemático concreto:

- **HTTP + API REST** — el backend expone endpoints REST convencionales
  (`/sedes`, `/productos`, `/pedidos`, `/pagos`, `/reportes/ventas`, ...)
  para todas las operaciones que no requieren empuje de servidor a cliente:
  login, consultas de catálogo, creación de pedidos, cobro. Documentados de
  forma interactiva en `/api/docs` (Swagger). Desde la Fase 13B la app entra
  por Nginx con **HTTPS/TLS 1.3 + HTTP/2** (cifrado del transporte y
  multiplexación de peticiones) y compresión gzip.
- **WebSocket (Socket.IO)** — el flujo estrella del producto (comanda
  aparece en cocina sin recargar) no se puede resolver con *polling* sin
  introducir latencia y carga innecesaria en el servidor: **necesitamos que
  el servidor empuje el evento al cliente en el momento en que ocurre**, no
  que el cliente pregunte cada N segundos "¿hay algo nuevo?". El WebSocket
  mantiene una conexión full-duplex persistente entre el KDS/mesero/caja y el
  backend. Por Nginx es `wss://` (WebSocket sobre TLS); entrando directo a
  Vite (puerto 5173) sigue siendo `ws://`.
- **Redis Pub/Sub** — el Gateway de WebSocket publica y se suscribe a eventos
  vía Redis en lugar de mantener el estado solo en memoria del proceso Node.
  Desde la Fase 13B hay **dos instancias del backend detrás de Nginx**, y es
  Redis el que hace que compartan el mismo canal de eventos en tiempo real:
  un KDS conectado a `backend-1` recibe la comanda que creó un mesero cuya
  petición atendió `backend-2`. Si una instancia se cae, Nginx manda todo a la
  otra y los sockets se reconectan solos.
- **Proxy inverso y balanceo (Nginx)** — punto único de entrada (§5.1):
  termina TLS, reparte la API en round robin entre las dos instancias, da
  afinidad (`ip_hash`) a Socket.IO para el handshake por long-polling y
  limita la tasa de los endpoints públicos sin autenticación (menú QR y
  domicilio: `429` al pasarse). Ver `nginx/nginx.conf`.
- **Multi-tenant / DNS** — como plantea la propuesta (§5.2), desde la Fase
  20B la cadena (tenant) se resuelve por subdominio (p. ej.
  `demo.<dominio>`) a partir del encabezado `Host` en las rutas públicas
  (menú QR, domicilio) y en el login; en AWS lo respaldan un DNS y un
  certificado comodín. Las rutas privadas siguen tomando el tenant del
  `cadena_id` del JWT — ver [`docs/prototipo-slice.md`](docs/prototipo-slice.md).
- **NTP / orden de eventos** — el documento fiscal simulado y la máquina de
  estados del pedido dependen de marcas de tiempo consistentes entre
  servicios (fecha del pedido, consecutivo fiscal, orden de transiciones de
  estado). Con varias instancias del backend, esto exige que todos los
  servidores tengan el reloj sincronizado vía NTP; en local las dos
  instancias corren en la misma máquina y comparten su reloj, así que el
  requisito queda documentado para un despliegue con varios servidores.

## Convenciones del código

- Entidades de dominio en español (`Pedido`, `Sede`, `Cadena`, `Mesa`,
  `PedidoDetalle`, `DocumentoFiscal`) para mapear 1:1 con la propuesta.
- Todo lo que no viene explícitamente del documento de propuesta está
  marcado en el código como `// DECISIÓN DE PROTOTIPO`.
- Todo lo que es un stub de una integración real futura está marcado como
  `// TODO PRODUCCIÓN`.
- Secretos y configuración solo en `.env` (nunca versionado); `.env.example`
  documenta cada variable.

## Plan de fases

Las fases `0` a `6` (scaffolding, datos, auth, REST, tiempo real, cobro,
pulido) cubren el flujo principal y ya están completas, cada una en un
commit independiente.

A partir de la fase `7`, el trabajo se dividió en dos partes en paralelo
(ver [`docs/fases-siguientes.md`](docs/fases-siguientes.md) para el plan
detallado y los contratos de integración entre ambas), ya integradas en
`main`:

- **Parte 1** — operación interna multi-sede: `Fase 7` (multi-sede real),
  `Fase 8` (rangos de numeración fiscal, §6.3), `Fase 9` (panel multi-sede,
  CU-06), `Fase 10` (catálogo centralizado, CU-08).
- **Parte 2** — canales hacia el cliente y resiliencia: `Fase 7B` (menú QR,
  CU-03), `Fase 8B` (domicilio web, CU-04), `Fase 9B` (modo offline del
  mesero, CU-07).

La ronda 2 (ver [`docs/fases-siguientes-2.md`](docs/fases-siguientes-2.md))
continúa la numeración con la misma división en dos partes:

- **Parte 1** — datos y reportes: `Fase 11` (inventario y recetas, §6.2),
  `Fase 12` (Row Level Security de Postgres, §6.1), `Fase 13` (réplica de
  lectura para reportes, §5.1), `Fase 14` (reportes por día/mes, producto y
  franja horaria en zona America/Bogota).
- **Parte 2** — infraestructura y canales: `Fase 11B` (cola de trabajos y
  validación DIAN simulada), `Fase 12B` (pedidos de plataforma simulados,
  CU-05), `Fase 13B` (Nginx con TLS 1.3/HTTP2/WSS y dos instancias del
  backend), `Fase 14B` (correo de comprobantes y resumen diario).

La ronda 3 (ver [`docs/fases-siguientes-3.md`](docs/fases-siguientes-3.md))
cierra el proyecto y lo migra a AWS con su plan gratuito. Ya integradas en
`main`:

- `Fase 15` — cierre de la ronda 2 y deudas.
- **Parte 1** — `Fase 16` (cobro sin conexión), `Fase 17` (sede por usuario,
  ampliada después con la pantalla `/usuarios`), `Fase 18` (datos y
  respaldos en AWS). Lo que quedó abierto está en
  [`docs/ronda3-parte1-pendientes.md`](docs/ronda3-parte1-pendientes.md).
- **Parte 2** — `Fase 16B` (imágenes de producto), `Fase 17B` (imágenes de
  producción), `Fase 18B` (CI/CD), `Fase 19B` (despliegue en EC2 con
  TLS/DNS/S3/SES), `Fase 20B` (subdominio por cadena), `Fase 21B` (monitoreo
  en CloudWatch).

Pendientes: `Fase 19` (pruebas de carga y medición de latencia) y `Fase 20`
(cierre del proyecto).

Ver el historial de `git log` para el detalle de qué trajo cada commit.
