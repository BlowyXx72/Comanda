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
```

`--wait` hace que el comando termine solo cuando todo está listo de verdad
(backend, frontend y nginx tienen healthcheck): si responde, ya se puede
entrar. El seed solo hace falta la primera vez.

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
cada vez que arranca el contenedor del backend; el seed (`prisma db seed`) es
un paso aparte y solo hace falta correrlo una vez (o de nuevo si quieres
resetear los datos de demo — el script es idempotente, borra y recrea todo).

Usuarios de prueba creados por el seed (contraseña de cada uno junto al
correo): `admin@demo.com` / `admin123`, `cajero@demo.com` / `cajero123`,
`mesero@demo.com` / `mesero123`. Desde la Fase 7 el seed crea **3 sedes**
para la cadena demo: ADMIN ve un selector de sede en el encabezado;
MESERO/CAJERO operan siempre en la última sede elegida en ese navegador.

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

## Otras funcionalidades (Fases 7 a 10)

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
  crear, editar y desactivar productos una sola vez; el cambio se propaga en
  vivo a `/mesas` y al menú QR de las 3 sedes, sin recargar.

## Estructura del repositorio

```
comanda/
├── docker-compose.yml
├── .env.example
├── docs/prototipo-slice.md   # alcance: propuesta vs. prototipo
├── backend/                  # NestJS (monolito modular)
└── frontend/                 # React + Vite + TS
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
- **Multi-tenant / DNS (a futuro)** — el documento de propuesta plantea
  resolver la cadena (tenant) por subdominio en producción (p. ej.
  `cadena-x.comanda.app`), lo que depende de DNS y de un mecanismo de
  enrutamiento por host. En este prototipo el tenant se resuelve de forma más
  simple, a partir del `cadena_id` embebido en el JWT — ver
  [`docs/prototipo-slice.md`](docs/prototipo-slice.md).
- **NTP / orden de eventos** — el documento fiscal simulado y la máquina de
  estados del pedido dependen de marcas de tiempo consistentes entre
  servicios (fecha del pedido, consecutivo fiscal, orden de transiciones de
  estado). En producción, con múltiples instancias de backend, esto exige que
  todos los servidores tengan el reloj sincronizado vía NTP; en este
  prototipo hay una sola instancia, así que el reloj del propio contenedor
  basta, pero el requisito queda documentado.

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

La ronda 3 (propuesta, ver [`docs/fases-siguientes-3.md`](docs/fases-siguientes-3.md))
cierra el proyecto y lo migra a AWS con su plan gratuito: `Fase 15` (cierre de
la ronda 2 y deudas), Parte 1 `Fase 16`–`18` (cobro sin conexión, sede por
usuario, datos y respaldos en AWS), Parte 2 `Fase 16B`–`21B` (imágenes de
producto en el menú QR, imágenes de producción, CI/CD, despliegue en EC2 con
TLS/DNS/S3/SES, subdominio por cadena y monitoreo en CloudWatch) y
`Fase 19`–`20` (pruebas de carga y cierre). Antes de empezar hay que decidir
región y dominio, y crear la cuenta de AWS cerca de la sustentación: el plan
gratuito dura 6 meses.

Ver el historial de `git log` para el detalle de qué trajo cada commit.
