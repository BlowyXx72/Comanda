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
`mesero@demo.com` / `mesero123`.

Verifica que todo esté sano:

```bash
curl http://localhost:3000/health
# { "status": "ok", "dependencies": { "postgres": "up", "redis": "up" }, ... }
```

`/health` valida Postgres con una consulta real vía Prisma y Redis con un
`PING` real vía `ioredis` (ver `backend/src/health/health.controller.ts`).

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

Las 7 fases del prototipo (`Fase 0` scaffolding, `Fase 1` datos, `Fase 2`
auth, `Fase 3` REST, `Fase 4` tiempo real, `Fase 5` cobro, `Fase 6` pulido)
ya están completas, cada una en un commit independiente — ver el historial
de `git log` para el detalle de qué trajo cada una.
