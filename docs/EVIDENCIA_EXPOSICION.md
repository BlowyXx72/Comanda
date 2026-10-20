# Evidencia real para la sustentación

Generado el 2026-10-20 ejecutando comandos reales contra el stack de este
repo (`main`, commit `c07e2b2`) en Windows con Docker Desktop. Todas las
salidas de este documento son recortes de salidas reales, no inventadas.
Donde algo falló, se dejó el error tal cual y los pasos manuales que lo
resolvieron. No se modificó código para este ejercicio; los únicos cambios
fueron de configuración (`.env`, reversibles) para simular fallas.

No se imprime el contenido de `.env` ni contraseñas reales en ningún punto
de este documento.

---

## 1. Arranque desde cero

Comando ejecutado tal cual:

```
docker compose down -v
docker compose up -d --build
```

### Tiempos reales

| Paso | Tiempo |
|---|---|
| `docker compose down -v` (sin nada corriendo, solo limpia volúmenes) | 3.4 s |
| `docker compose up -d --build` (build de 5 imágenes + arranque de 10 contenedores) | 1m 18s |
| `docker compose run --rm backend-1 npm install` (paso manual, ver abajo) | 7.0 s |
| `docker compose run --rm backend-1 npx prisma db seed` | 5.9 s |
| **Total hasta stack usable** | **~1m 35s** |

### Qué falló (real, no simulado)

El arranque automático **no levantó un backend funcional a la primera**.
`backend-1` arrancó, compiló, pero al ejecutar código lanzó:

```
node:fs:560
  return binding.open(
                 ^
Error: ENOENT: no such file or directory, open '/app/dist/generated/prisma/internal/class.js'
    at Object.openSync (node:fs:560:18)
    ...
Node.js v22.23.3
```

**Causa:** `backend/src/generated/prisma/` (el cliente de Prisma generado)
vive bajo `./backend`, que es un **bind mount** del host
(`volumes: - ./backend:/app`). Ese directorio está en `.gitignore` y no se
genera solo al hacer `docker compose up --build`: el build de la imagen sí
corre `npm install` (que dispara `prisma generate` por `postinstall`), pero
como el bind mount del host se superpone a `/app` en tiempo de ejecución,
si en el host no existe `backend/src/generated/`, el contenedor arranca sin
el cliente generado.

**Pasos manuales que lo arreglaron:**

```
docker compose run --rm backend-1 npm install   # dispara `prisma generate` por postinstall
docker compose restart backend-1 backend-2 worker
```

Tras esto, `backend-1` arrancó limpio:

```
[Nest] 136  -  ... LOG [PrismaReplicaService] Conexión a la réplica de lectura establecida (comanda_app)
[Nest] 136  -  ... LOG [PrismaService] Conexión a Postgres establecida (dueño + comanda_app)
[Nest] 136  -  ... LOG [NestApplication] Nest application successfully started
```

### Verificación final

```
$ docker compose ps
NAME                       STATUS                        PORTS
comanda-backend-1          Up                            0.0.0.0:3000->3000, 0.0.0.0:5556->5556
comanda-backend-2          Up                            3000/tcp
comanda-frontend           Up                            0.0.0.0:5173->5173
comanda-mailpit            Up (healthy)                  0.0.0.0:8025->8025
comanda-minio               Up                           0.0.0.0:9000-9001->9000-9001
comanda-nginx               Up                           0.0.0.0:8443->443
comanda-postgres            Up (healthy)                 0.0.0.0:5432->5432
comanda-postgres-replica    Up (healthy)                 0.0.0.0:5433->5432
comanda-redis               Up (healthy)                 0.0.0.0:6379->6379
comanda-worker               Up                          3000/tcp

$ curl -s http://localhost:3000/health
{"status":"ok","dependencies":{"postgres":"up","redis":"up"},"timestamp":"2026-10-20T14:46:21.969Z"}
```

Seed final: `1 cadena, 3 sedes, 3 usuarios, 8 productos, 18 mesas, 15 insumos, receta en 8 productos.`

---

## 2. Red

```
$ docker network ls
NETWORK ID     NAME                    DRIVER    SCOPE
946b5e7cc2fa   bridge                  bridge    local
4878bdf27681   comanda_default         bridge    local
1e6f3320b8b1   host                    host      local
2072c31e2b31   none                    null      local
```
(se omiten redes de otros proyectos de la máquina — `codigomuestra_default`,
`minikube` — no corresponden a Comanda).

```
$ docker network inspect comanda_default --format '{{range .IPAM.Config}}Subred: {{.Subnet}} Gateway: {{.Gateway}}{{end}}'
Subred: 172.19.0.0/16 Gateway: 172.19.0.1
```

### Tabla contenedor | IP | subred

| Contenedor | IP interna | Subred |
|---|---|---|
| comanda-redis | 172.19.0.2 | /16 |
| comanda-minio | 172.19.0.3 | /16 |
| comanda-mailpit | 172.19.0.4 | /16 |
| comanda-postgres | 172.19.0.5 | /16 |
| comanda-postgres-replica | 172.19.0.6 | /16 |
| comanda-backend-1 | 172.19.0.7 | /16 |
| comanda-backend-2 | 172.19.0.8 | /16 |
| comanda-worker | 172.19.0.9 | /16 |
| comanda-frontend | 172.19.0.10 | /16 |
| comanda-nginx | 172.19.0.11 | /16 |

### Puertos publicados en el host

| Contenedor | Puerto host | Puerto contenedor |
|---|---|---|
| comanda-postgres | 5432 | 5432 |
| comanda-postgres-replica | 5433 | 5432 |
| comanda-redis | 6379 | 6379 |
| comanda-backend-1 | 3000, 5556 | 3000, 5556 (Prisma Studio) |
| comanda-backend-2 | *(ninguno — solo accesible vía Nginx/red interna)* | 3000 |
| comanda-frontend | 5173 | 5173 |
| comanda-nginx | 8443 | 443 |
| comanda-mailpit | 8025 | 8025 |
| comanda-minio | 9000, 9001 | 9000, 9001 |
| comanda-worker | *(ninguno — no expone HTTP)* | 3000 (sin publicar) |

---

## 3. Tabla de comunicaciones

Construida leyendo `nginx/nginx.conf`, `docker-compose.yml` y `.env.example`
(solo nombres de host/puerto, nunca valores de `.env`).

| Origen | Destino | Puerto | Protocolo | Cifrado |
|---|---|---|---|---|
| Navegador/cliente | comanda-nginx | 8443 (host) → 443 | HTTPS/HTTP2 + WSS | **Sí** (TLS 1.3) |
| comanda-nginx | frontend:5173 (interno) | 5173 | HTTP (Vite dev + HMR ws) | No (red interna de Docker) |
| comanda-nginx | backend-1:3000 / backend-2:3000 (`backend_api`, round robin) | 3000 | HTTP/1.1 | No |
| comanda-nginx | backend-1:3000 / backend-2:3000 (`backend_ws`, ip_hash) | 3000 | HTTP (upgrade a WS) | No |
| backend-1/2, worker | postgres:5432 (rol dueño, migraciones/seed) | 5432 | Postgres wire protocol | No |
| backend-1/2, worker | postgres:5432 (rol `comanda_app`, vía `conCadena()`) | 5432 | Postgres wire protocol | No |
| backend-1/2 (solo `ReportsService`) | postgres-replica:5432 (rol `comanda_app`) | 5432 | Postgres wire protocol | No |
| postgres-replica | postgres:5432 | 5432 | Replicación en streaming de Postgres | No |
| backend-1/2 | redis:6379 (adaptador de Socket.IO, backplane) | 6379 | RESP (Redis) | No |
| worker | redis:6379 (colas BullMQ: fiscal, acuses, correo) | 6379 | RESP (Redis) | No |
| backend-1/2, worker | minio:9000 (API S3, XML fiscales) | 9000 | HTTP (API S3) | No |
| worker | mailpit:1025 (SMTP) | 1025 | SMTP | No (`SMTP_SECURE=false`) |
| worker | alias `backend`:3000 (acuse a `/simulador-plataforma/.../acuses`) | 3000 | HTTP | No |
| Navegador/cliente | comanda-frontend (acceso directo, bypass Nginx) | 5173 | HTTP/WS (Vite dev) | No |
| Navegador/cliente | comanda-backend-1 (acceso directo, bypass Nginx) | 3000 | HTTP/WS | No |
| Navegador/cliente | comanda-mailpit (bandeja web) | 8025 | HTTP | No |
| Navegador/cliente | comanda-minio (consola) | 9001 | HTTP | No |
| Herramientas (psql, DBeaver, etc.) | comanda-postgres / -replica | 5432 / 5433 | Postgres wire protocol | No |

**Lectura clave:** el único tramo cifrado de punta a punta es
`navegador → Nginx` (TLS 1.3 obligatorio, `ssl_protocols TLSv1.3;` sin
fallback a 1.2). Todo lo que pasa **dentro** de la red Docker
(`comanda_default`) va sin cifrar — `// TODO PRODUCCIÓN` no declarado
explícitamente en el código para esto; es una limitación real del
prototipo que vale la pena mencionar en la sustentación: en producción
también se cifraría el tráfico interno (mTLS o una red privada gestionada).

---

## 4. DNS

```
$ nslookup localhost
Respuesta no autoritativa:
Servidor:  11001prgx040sa6.usantotomas.red
Address:  172.16.1.45

Nombre:  localhost
Address:  127.0.0.1

$ nslookup github.com
Respuesta no autoritativa:
Servidor:  11001prgx040sa6.usantotomas.red
Address:  172.16.1.45

Nombre:  github.com
Address:  140.82.114.4
```

(`dig` no está disponible en este Git Bash de Windows; `nslookup` cubre lo
mismo y viene con el sistema).

---

## 5. TLS

```
$ echo | openssl s_client -connect localhost:8443 -tls1_3
subject=CN=localhost, O=Comanda Central (prototipo)
issuer=CN=localhost, O=Comanda Central (prototipo)
New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384
Verify return code: 18 (self-signed certificate)
```

ALPN (negociación de HTTP/2 por el servidor):

```
$ echo | openssl s_client -connect localhost:8443 -alpn h2 -tls1_3
ALPN protocol: h2
```

Payload real por HTTPS a través de Nginx:

```
$ curl -sk https://localhost:8443/api/health
{"status":"ok","dependencies":{"postgres":"up","redis":"up"},"timestamp":"2026-10-20T14:47:51.500Z"}
```

Rechazo de TLS 1.2 (el servidor solo acepta 1.3):

```
$ echo | openssl s_client -connect localhost:8443 -tls1_2
...:error:0A00042E:SSL routines:ssl3_read_bytes:tlsv1 alert protocol version:...:909:SSL alert number 70
```

**Nota honesta:** ni el `curl` de Git Bash (mingw, libcurl sin HTTP/2) ni el
`curl.exe` nativo de Windows (`curl 8.21.0`, backend Schannel, sin feature
`HTTP2`) traen soporte de HTTP/2 compilado en esta máquina. Por eso el
HTTP/2 se verificó por el lado del servidor (ALPN con `openssl`) en vez de
con `curl -vk --http2` como pedía el enunciado — es una limitación de las
herramientas del host, no de Nginx.

---

## 6. Captura de paquetes (login + `POST /pedidos`)

Herramientas: Wireshark/`tshark` 4.6.9 + driver Npcap (ya estaban
instalados y el servicio `npcap` corriendo). Interfaz usada:
`\Device\NPF_Loopback` (todo el tráfico va a `localhost:8443`, publicado
por Docker).

```
tshark -i "\Device\NPF_Loopback" -f "tcp port 8443" -w captura_comanda.pcapng -a duration:25
```

Durante la captura se ejecutó tráfico real: login (`POST /api/auth/login`)
y un `POST /api/pedidos`. Resultado: **109 paquetes capturados**.

### Jerarquía de protocolos vista por tshark

```
frame   frames:109 bytes:27121
  ipv6  frames:109 bytes:27121
    tcp frames:109 bytes:27121
      tls frames:37 bytes:22393
```

tshark **no pudo identificar nada por encima de `tls`** (ni `http`, ni
`http2`) — exactamente lo esperado si el contenido va cifrado: sin las
claves de sesión (no se configuró `SSLKEYLOGFILE`), Wireshark ve records
TLS, no el HTTP de adentro.

### Handshake (Client Hello / Server Hello)

```
$ tshark -r captura_comanda.pcapng -Y "tls.handshake" -T fields \
    -e frame.number -e tls.handshake.type -e tls.handshake.extensions_server_name
4   1 (Client Hello)  localhost
6   2 (Server Hello)
```

Versión negociada, extraída del campo `supported_version` del Server Hello:

```
$ tshark -r captura_comanda.pcapng -Y "tls.handshake.type==2" -T fields \
    -e tls.handshake.extensions.supported_version
0x0304     # TLS 1.3
```

### Prueba de que el payload va cifrado

Búsqueda de texto plano en **las 109 tramas completas** de la captura:

```
$ tshark -r captura_comanda.pcapng \
    -Y "frame contains \"admin123\" or frame contains \"accessToken\" or frame contains \"Authorization\""
(sin resultados)
```

Ni la contraseña (`admin123`), ni el token emitido (`accessToken`), ni el
header `Authorization` aparecen en texto plano en ningún paquete — el
canal está cifrado de verdad, no es solo el candado del navegador.

---

## 7. Caídas simuladas

### 7.1 Caída de `backend-2` (una de las dos instancias)

```
$ docker compose stop backend-2
$ for i in 1 2 3 4; do curl -sk -o /dev/null -w "intento $i -> HTTP %{http_code}\n" https://localhost:8443/api/health; done
intento 1 -> HTTP 200
intento 2 -> HTTP 200
intento 3 -> HTTP 200
intento 4 -> HTTP 200
```

Log de Nginx (`$upstream_addr`) — se ve el failover en vivo en la primera
petición después de parar `backend-2` (intenta `.8`, falla, reintenta en
`.7` dentro de la misma petición):

```
2026/10/20 ... [error] upstream timed out ... upstream: "http://172.19.0.8:3000/health"
172.19.0.1 "GET /api/health HTTP/1.1" 200 -> 172.19.0.8:3000, 172.19.0.7:3000 (2.016 s)
172.19.0.1 "GET /api/health HTTP/1.1" 200 -> 172.19.0.7:3000 (0.006 s)
2026/10/20 ... [error] backend-2 could not be resolved (2: Server failure)
```

### 7.2 Caída de las DOS instancias

```
$ docker compose stop backend-1
$ curl -sk -o /dev/null -w "HTTP %{http_code}\n" https://localhost:8443/api/health --max-time 5
HTTP 502
```

Con las dos caídas, la API sí cae por completo (502) — Nginx no tiene a
dónde más mandar el tráfico. Esto es correcto y esperado, no un error:
demuestra que la tolerancia a fallas es de **una** instancia, no de las
dos a la vez. Se reinició `backend-1` y `backend-2` y el stack volvió a
responder 200 normalmente.

### 7.3 Caída de Redis — hallazgo real de fragilidad

```
$ docker compose stop redis
$ curl -sk https://localhost:8443/api/health --max-time 5
(timeout, exit code 28)
```

Log de `backend-1` mientras Redis estaba caído:

```
Error: connect ETIMEDOUT
    at Socket.<anonymous> (/app/node_modules/ioredis/built/Redis.js:196:41)
    ...
missing 'error' handler on this Redis client
```

**Esto NO es degradación controlada: es una caída total.** El contenedor
sigue "Up" según Docker, pero Nest nunca termina de arrancar (el log
`Nest application successfully started` no vuelve a aparecer) mientras
`ioredis` reintenta conectar a Redis sin parar — el adaptador de Socket.IO
bloquea el bootstrap completo de la aplicación. Al reiniciar Redis
(`docker compose start redis`), el backend se recuperó solo en ~20 s sin
necesidad de reiniciarlo manualmente:

```
$ docker compose start redis
$ curl -s http://localhost:3000/health
{"status":"ok","dependencies":{"postgres":"up","redis":"up"},...}
```

### 7.4 "DIAN simulada" caída

Se subió temporalmente `DIAN_SIMULADA_TASA_FALLA` de `0.2` a `1.0` en
`.env` (cambio de configuración, no de código; revertido al terminar) y se
reinició solo el `worker`. Se cobró un pedido real:

```
POST /api/pedidos -> 201
PATCH .../estado (LISTO) -> 200
POST /api/pagos -> 201, documentoFiscal.estadoDian = "PENDIENTE"
```

**La caja no esperó al proveedor** (el cobro respondió de inmediato). El
worker, en segundo plano, reintentó con backoff creciente:

```
[WARN] Intento 1 del documento ... falló: Proveedor DIAN (simulado) no disponible   (2026-10-20 14:52:57)
[WARN] Intento 2 del documento ... falló: Proveedor DIAN (simulado) no disponible   (2026-10-20 14:53:01, +4s)
[WARN] Intento 3 del documento ... falló: Proveedor DIAN (simulado) no disponible   (2026-10-20 14:53:07, +6s)
```

Se restauró `DIAN_SIMULADA_TASA_FALLA=0.2` y se reinició el `worker`.

---

## 8. Modo offline

**No se pudo probar de punta a punta.** Esta sesión no tiene una
herramienta de navegador disponible (no hay forma de abrir DevTools, cortar
la red desde el navegador, ni inspeccionar IndexedDB/el service worker), así
que no hay evidencia real del flujo completo descrito en el enunciado
(mesero crea pedidos sin red, reconecta, `/sync` los sube).

Lo que **sí** se verificó — la mitad de backend del contrato de
idempotencia que usa ese flujo — llamando `POST /sync` directo:

```
$ curl -X POST .../api/sync -d '{"pedidos":[{"id":"0ff1c0de-...", ...}]}'
[{"id":"0ff1c0de-...","resultado":"CREADO"}]

$ curl -X POST .../api/sync -d '{"pedidos":[{"id":"0ff1c0de-...", ...}]}'   # mismo lote, reenviado
[{"id":"0ff1c0de-...","resultado":"DUPLICADO"}]
```

El backend es idempotente por UUID: reenviar el mismo lote no duplica el
pedido. Lo que falta verificar manualmente (recomendado antes de la
sustentación, con un navegador real): que el service worker/IndexedDB del
mesero efectivamente encolan localmente con `navigator.onLine === false` y
que el indicador "Sin conexión — N pedidos pendientes" de `/mesas` aparece
y desaparece correctamente.

---

## 9. Suite de tests automatizados

```
$ docker compose run --rm backend-1 npx vitest run

 ✓ src/app.controller.spec.ts (1 test) 169ms
 ✓ test/rls-aislamiento.spec.ts (4 tests) 593ms
 ✓ test/replica-solo-lectura.spec.ts (5 tests) 653ms
     ✓ está en recuperación (es una réplica) 312ms

 Test Files  3 passed (3)
      Tests  10 passed (10)
   Duration  1.56s
```

10/10 pasan: aislamiento RLS (0 filas sin `app.cadena_id`, cadena A no ve
cadena B, INSERT/UPDATE ajeno falla) y réplica de solo lectura (RLS también
aplica ahí, y escribir en la réplica falla).

---

## Lo que no funcionó o es frágil (resumen para la sustentación)

1. **El arranque desde cero no es un solo comando.** `docker compose up -d
   --build` no basta la primera vez: hace falta `docker compose run --rm
   backend-1 npm install` después, porque el cliente de Prisma generado
   vive en un bind mount del host que no sobrevive a una limpieza de
   `backend/src/generated/`. Si alguien clona el repo y nunca borró esa
   carpeta, probablemente no le pase — pero en una máquina nueva o tras un
   `git clean -fdx`, sí.
2. **Redis es un punto único de falla para todo el backend**, no solo para
   el tiempo real: si Redis está caído, el backend entero no termina de
   arrancar (bloqueado reintentando conectar el adaptador de Socket.IO), no
   hay degradación — ni siquiera responde `/health`. Se recupera solo al
   volver Redis, pero mientras tanto la API completa está caída.
3. **El tráfico interno de Docker no va cifrado** (solo
   `navegador → Nginx` tiene TLS). Esto es coherente con ser un prototipo
   de una sola red Docker local, pero es una limitación real frente a
   producción que vale la pena nombrar explícitamente.
4. **Las herramientas de HTTP/2 del lado cliente en esta máquina Windows no
   sirven** (ni el `curl` de Git Bash ni el `curl.exe` nativo traen HTTP/2
   compilado) — hubo que verificar HTTP/2 por el lado del servidor con
   `openssl`/ALPN en vez de con `curl --http2`.
5. **El modo offline no se verificó de punta a punta** — falta pasar por un
   navegador real antes de la sustentación para confirmar visualmente la
   cola local y el indicador de "pedidos pendientes".
6. Con **las dos instancias de backend caídas simultáneamente**, la API cae
   por completo (502) — la tolerancia a fallas cubre una instancia, no
   ambas (comportamiento esperado, no un bug, pero hay que saber explicarlo
   si preguntan "¿y si se caen las dos?").
