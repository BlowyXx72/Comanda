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

## Cómo levantar el proyecto

```bash
cp .env.example .env
docker compose up -d
docker compose exec backend npx prisma db seed
```

Esto levanta:

| Servicio | URL | Descripción |
|---|---|---|
| Postgres | `localhost:5432` | Base de datos |
| Redis | `localhost:6379` | Caché / Pub-Sub para el WebSocket |
| Backend (NestJS) | http://localhost:3000 | API REST + Gateway WebSocket |
| Frontend (React) | http://localhost:5173 | Interfaz web |
| Swagger | http://localhost:3000/api/docs | Documentación interactiva de la API |

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
docker compose exec -d backend npx prisma studio --port 5555 --browser none
```

`prisma studio` solo escucha en `127.0.0.1` dentro del contenedor (y no
tiene una bandera para cambiarlo), así que el puerto publicado en
`docker-compose.yml` (`5556`) no llega directo a él. Hace falta un pequeño
proxy HTTP en el medio, que además reescribe el encabezado `Host` (Studio
rechaza con 403 cualquier request cuyo `Host` no coincida con el puerto en
el que arrancó):

```bash
docker compose exec -d backend node -e "
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

Con dos (o tres) pestañas del navegador abiertas en http://localhost:5173:

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
  forma interactiva en `/api/docs` (Swagger). En local corre sobre HTTP
  plano; **en producción iría sobre HTTPS/TLS 1.3 + HTTP/2** para cifrar el
  transporte y multiplexar peticiones.
- **WebSocket (Socket.IO)** — el flujo estrella del producto (comanda
  aparece en cocina sin recargar) no se puede resolver con *polling* sin
  introducir latencia y carga innecesaria en el servidor: **necesitamos que
  el servidor empuje el evento al cliente en el momento en que ocurre**, no
  que el cliente pregunte cada N segundos "¿hay algo nuevo?". El WebSocket
  mantiene una conexión full-duplex persistente entre el KDS/mesero/caja y el
  backend. En local es `ws://`; **en producción sería `wss://`** (WebSocket
  sobre TLS).
- **Redis Pub/Sub** — el Gateway de WebSocket publica y se suscribe a eventos
  vía Redis en lugar de mantener el estado solo en memoria del proceso Node.
  En este prototipo hay una sola instancia de backend, así que Redis no es
  estrictamente necesario para que funcione, pero se incluye desde ya porque
  es lo que permite que, en producción, **varias instancias del backend
  (detrás de un balanceador) compartan el mismo canal de eventos en tiempo
  real** sin que un cliente conectado a la instancia A se pierda un evento
  emitido por la instancia B.
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

Ver el historial de `git log` para el detalle de qué trajo cada commit.
