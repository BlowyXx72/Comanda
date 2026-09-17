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
docker compose up
```

Esto levanta:

| Servicio | URL | Descripción |
|---|---|---|
| Postgres | `localhost:5432` | Base de datos |
| Redis | `localhost:6379` | Caché / Pub-Sub para el WebSocket |
| Backend (NestJS) | http://localhost:3000 | API REST + Gateway WebSocket |
| Frontend (React) | http://localhost:5173 | Interfaz web |

Verifica que todo esté sano:

```bash
curl http://localhost:3000/health
# { "status": "ok", "dependencies": { "postgres": "up", "redis": "up" }, ... }
```

> **Estado de la Fase 0:** el chequeo de `/health` valida que los puertos TCP
> de Postgres y Redis respondan. A partir de la Fase 1 (cuando exista el
> schema de Prisma y las migraciones) y la Fase 4 (cliente de Redis del
> Gateway), este chequeo pasará a usar los clientes reales.

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
  (`/sedes`, `/productos`, `/pedidos`, `/pagos`, ...) para todas las
  operaciones que no requieren empuje de servidor a cliente: login, consultas
  de catálogo, creación de pedidos, cobro. En local corre sobre HTTP plano;
  **en producción iría sobre HTTPS/TLS 1.3 + HTTP/2** para cifrar el
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

Ver el historial de commits: cada fase (`Fase 0` scaffolding, `Fase 1` datos,
`Fase 2` auth, `Fase 3` REST, `Fase 4` tiempo real, `Fase 5` cobro, `Fase 6`
pulido) se entrega en un commit independiente.
