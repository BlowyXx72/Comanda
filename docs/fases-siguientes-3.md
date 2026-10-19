# Fases siguientes (ronda 3) — cierre del proyecto y migración a la nube

Las rondas 1 y 2 están completas e integradas en `main` (ver
[`fases-siguientes.md`](fases-siguientes.md) y
[`fases-siguientes-2.md`](fases-siguientes-2.md)), junto con el rediseño del
frontend (PR #3 y #4). Esta ronda cierra lo que falta del prototipo y lo lleva
de Docker en un PC a la nube, como plantea la propuesta: "servidor central en
la nube" (§3.2, §6.3) y la diapositiva "Infraestructura en la nube
(producción)" de la sustentación.

> **Para el Claude Code que lea esto:** respeta `CLAUDE.md` (regla de oro,
> marcas `// DECISIÓN DE PROTOTIPO` / `// TODO PRODUCCIÓN`, un commit por fase
> y pausa para mostrar avance). Trabaja **solo** en tu parte y en tu rama.
> Antes de tocar un archivo compartido, lee
> [Contratos de integración](#contratos-de-integración).

## Estado al empezar la ronda 3

| Caso de uso | Estado |
|---|---|
| CU-01 Pedido en mesa | Implementado; sin impresora ni tablet dedicada (hardware fuera de alcance). |
| CU-02 Cobro y documento fiscal | Implementado con DIAN **simulada** en segundo plano (11B). La DIAN real sigue prohibida. |
| CU-03 Menú QR | Implementado (7B). |
| CU-04 Domicilio web | Implementado (8B) y con correo de comprobante (14B). |
| CU-05 Pedido de plataforma | Implementado contra un **simulador** (12B). Rappi real sigue prohibido. |
| CU-06 Panel multi-sede | Implementado (9 y 14), leyendo de la réplica (13). |
| CU-07 Operación sin conexión | **Parcial**: el mesero encola pedidos offline (9B), pero cobrar requiere red. |
| CU-08 Catálogo centralizado | Implementado (10). |

Infraestructura de §5.1 que ya existe en Docker local: Nginx con TLS 1.3 /
HTTP/2 / WSS y límite de tasa, dos instancias del backend, worker con cola
BullMQ, PostgreSQL con RLS y réplica de lectura, Redis, MinIO (S3) y SMTP
contra Mailpit.

Calidad, medida al escribir este documento:

- **Pruebas:** 10 pruebas en verde (RLS, réplica de solo lectura y el
  controlador base). Los flujos de la Parte 2 (cola fiscal, plataforma,
  correo, sync) no tienen pruebas automáticas.
- **Lint:** `oxlint` sin advertencias en el backend; 11 advertencias en el
  frontend.
- **Build:** el frontend compila para producción (`npm run build`).
- **Sin CI**, y solo hay Dockerfiles de desarrollo (`Dockerfile.dev`, con
  `--watch`).

## Antes de empezar: decisiones que hay que confirmar

La propuesta dice "en la nube" pero **no fija proveedor ni región**. Ninguna
fase de nube empieza sin cerrar esto (conviene validarlo con el docente):

1. **Proveedor y región.** La propuesta estima 80–120 ms desde Bogotá a "la
   región de nube más cercana", a confirmar midiendo (§6.3). Revisar si el
   equipo tiene créditos educativos con algún proveedor.
2. **Beta o producción completa.** La sustentación distingue dos niveles:
   - **Beta:** "un VPS pequeño con HTTPS". Encaja con correr un
     `docker-compose.prod.yml` en una sola máquina.
   - **Producción:** contenedores, dos máquinas para la aplicación, PostgreSQL
     con réplica y Redis **administrados**, y CDN y almacén de objetos por
     consumo.

   Propuesta de este plan: llegar a la beta sí o sí, y hacer la producción
   administrada si hay presupuesto o créditos.
3. **Dominio.** La propuesta usa `lacadena.comandacentral.co` como ejemplo de
   subdominio por cadena (§5.2). Hace falta un dominio real (o uno gratuito de
   pruebas) para TLS válido y DNS.
4. **Herramientas nuevas.** `CLAUDE.md` exige preguntar antes de agregarlas:
   - GitHub Actions y un registro de imágenes (p. ej. GHCR o el del
     proveedor), para la Fase 17B.
   - Infraestructura como código (p. ej. Terraform). Es opcional; sin ella la
     infraestructura se crea a mano y se documenta.
   - Una herramienta de pruebas de carga (p. ej. k6), para la Fase 20.

**Siguen fuera de alcance**, también en la nube:

- DIAN real y Rappi real (reglas duras): los simuladores se despliegan igual.
- Aplicación móvil y realidad aumentada: la propuesta los excluye (§1.4).
- Impresora de cocina y hardware de sede.

---

## Fase 15 — Cierre de la ronda 2 y deudas antes de migrar (ambos)

Antes de subir a la nube, dejar el sistema verificado en local:

- Correr la **prueba de integración final** de la ronda 2
  ([`fases-siguientes-2.md`](fases-siguientes-2.md), contrato 5) de punta a
  punta y anotar el resultado.
- **Pruebas automáticas** de los flujos que hoy no tienen (cada parte las de
  sus módulos):
  - Parte 2: cola fiscal (pendiente → validado/rechazado), plataforma
    (idempotencia por `orderId`, API key inválida), correo (comprobante solo
    con email) y `/sync`.
  - Parte 1: cobro con descuento de inventario, reportes en zona Bogotá.
- Dejar en 0 las 11 advertencias de `oxlint` del frontend.
- Validación pendiente detectada en las pruebas: `POST/PATCH /productos`
  acepta nombres con espacios al inicio o al final; recortarlos en el DTO
  (Parte 1, dueño de `catalog/`).
- Commit: `Fase 15: prueba de integración final de la ronda 2 y deudas`.

---

## Parte 1 — Funcionalidad pendiente y datos en la nube (Miguel)

### Fase 16 — Cobro y consecutivos sin conexión (completa CU-07, §6.3)

§6.3: "a cada sede se le pre-asigna un rango de numeración propio, de modo que
dos sedes (o una sede sin conexión) nunca generen el mismo consecutivo".

- Reservar **sub-rangos de numeración por dispositivo** dentro del rango de la
  sede, para que una caja sin red pueda numerar sin chocar con otra.
- Cola local de cobros en la PWA de caja (IndexedDB, igual que la de pedidos
  de 9B), con el UUID generado en el cliente.
- `POST /sync` (Parte 2) acepta también pagos: los concilia, crea el documento
  fiscal con el consecutivo reservado y lo encola a la DIAN simulada.
- Coordinar con la Parte 2 el contrato de `/sync` (ver contratos).
- Commit: `Fase 16: cobro y numeración fiscal sin conexión (CU-07)`.

### Fase 17 — Sede asignada al usuario (recomendada antes de la nube)

Hoy `Usuario` no tiene `sedeId` y la sede del mesero/cajero vive en
`localStorage`. En la nube, con usuarios reales, eso deja que cualquiera opere
en cualquier sede de su cadena.

- `Usuario.sedeId` opcional (ADMIN sin sede = todas) y validación en backend.
- Si se quiere, política RLS o filtro por sede además de por cadena.
- `// DECISIÓN DE PROTOTIPO`: la propuesta no lo fija; decidir con el equipo.
- Commit: `Fase 17: sede asignada al usuario`.

### Fase 18 — Base de datos y caché administradas (§5.1, §4.2)

- **PostgreSQL administrado** (primario + réplica de lectura del proveedor),
  que reemplaza los contenedores `postgres` y `postgres-replica`.
  - Verificar que RLS y el rol `comanda_app` funcionan igual en el servicio
    administrado (algunos restringen roles y extensiones).
  - Migraciones como **paso de despliegue único** (`prisma migrate deploy`),
    no en el arranque de cada instancia.
- **Redis administrado** para Socket.IO, BullMQ y caché.
- **Respaldos y retención:**
  - Respaldos diarios con restauración **probada**: la sustentación pide
    "respaldos diarios".
  - Política de retención de 5 años para los XML fiscales en el almacén de
    objetos (§4.2).
- Seed solo en ambientes de prueba, nunca en producción.
- Commit: `Fase 18: PostgreSQL y Redis administrados`.

---

## Parte 2 — Preparación y despliegue en la nube (Dikersson)

### Fase 16B — Imágenes de producción y configuración por entorno

Los Dockerfiles actuales son de desarrollo (`--watch`, bind mounts).

- **Backend** multi-etapa: `nest build` → imagen con `node dist/main.js`. El
  worker usa la misma imagen con otro comando (`dist/worker.js`).
- **Frontend:** `vite build` → archivos estáticos servidos por Nginx (y luego
  por la CDN).
- `docker-compose.prod.yml` para la beta en VPS: sin bind mounts, sin
  `--watch` y sin puertos de depuración (`3000`, `5556` de Prisma Studio).
- **Endurecimiento por entorno**, todo por variables, sin cambiar código entre
  ambientes:
  - CORS restringido al dominio real (hoy `enableCors()` acepta cualquier
    origen) y Swagger apagado en producción.
  - Logs a stdout en formato estructurado.
  - Apagado ordenado de las conexiones (Socket.IO, colas).
- Commit: `Fase 16B: imágenes de producción y docker-compose.prod`.

### Fase 17B — Integración y despliegue continuos (CI/CD)

- En cada PR: `oxlint`, `tsc`, pruebas del backend (con Postgres y Redis de
  servicio) y `npm run build` del frontend. Un PR que falle no se integra.
- Al integrar a `main`: construir y publicar las imágenes en el registro y
  desplegar a la beta.
- Producción con aprobación manual.
- Secretos de despliegue en el gestor del CI, nunca en el repo.
- Commit: `Fase 17B: CI/CD con pruebas, imágenes y despliegue`.

### Fase 18B — Despliegue en la nube: red, TLS, DNS, CDN, objetos y correo (§5.1, §5.2)

- **Cómputo:** las dos instancias del backend y el worker en máquinas o
  contenedores del proveedor, detrás de Nginx (o del balanceador del
  proveedor, manteniendo las reglas de `nginx/nginx.conf`: TLS 1.3, HTTP/2,
  WSS, `ip_hash` para Socket.IO, `limit_req`).
- **TLS real:** certificado de una CA (p. ej. Let's Encrypt o el del
  proveedor) en vez del autofirmado de 13B. Con esto la PWA funciona en
  cualquier teléfono.
- **DNS:** dominio del servicio. Los subdominios por cadena son la Fase 19B.
- **CDN** para la PWA y las imágenes del menú (§4.3: absorbe ~90% del
  tráfico).
- **Almacén de objetos** del proveedor en vez de MinIO. El código ya usa el
  cliente S3 estándar, así que solo cambian las variables `S3_*`.
- **SMTP real** en vez de Mailpit (relay con TLS, SPF/DKIM en el dominio).
  Los comprobantes siguen diciendo "documento simulado".
- **Gestión de secretos** del proveedor (JWT, base de datos, API keys,
  SMTP), según la sustentación.
- **Acceso de administración:** SSH solo con llaves (§5.2) o, si todo es
  administrado, sin SSH. NTP lo da el proveedor; documentarlo.
- Commit: `Fase 18B: despliegue en la nube con TLS, DNS, CDN, objetos y SMTP`.

### Fase 19B — Subdominio por cadena (§5.2, DNS multi-tenant)

§5.2: "resolución del dominio y subdominios por cadena (multi-tenant), p. ej.
lacadena.comandacentral.co".

- DNS comodín (`*.dominio`) y certificado comodín.
- El backend resuelve la cadena por el `Host` en las rutas públicas (menú QR,
  domicilio, login), además del `cadena_id` del JWT.
- El QR de las mesas apunta al subdominio de la cadena.
- Commit: `Fase 19B: subdominio por cadena`.

### Fase 20B — Monitoreo, registro centralizado y alertas (§5.1, §5.2 Syslog/métricas)

- Logs centralizados de backend, worker y Nginx con el servicio del
  proveedor (equivalente a Syslog).
- Métricas y alertas mínimas:
  - Disponibilidad de `/health` y latencia de la API.
  - Cola fiscal atascada (trabajos `PENDIENTE` viejos) y errores del worker.
  - CPU y memoria de la base de datos.
- Un *runbook* corto: qué hacer si cae una instancia, Redis o la base, y cómo
  restaurar un respaldo.
- Commit: `Fase 20B: monitoreo, logs centralizados y alertas`.

---

## Fases finales (ambos)

### Fase 20 — Pruebas de carga y medición de latencia (§4, §6.3)

- Validar el dimensionamiento de §4: la plataforma se diseñó para **1.000
  sesiones concurrentes** y ráfagas de **~2 TPS** de ventas en la hora pico.
- Medir la latencia real desde Bogotá a la región elegida (§6.3 la deja "a
  confirmar por medición").
- Repetir la prueba de caída de una instancia (13B), ahora en la nube.
- Commit: `Fase 20: pruebas de carga y latencia en la nube`.

### Fase 21 — Cierre del proyecto

- Actualizar `prototipo-slice.md`, `CLAUDE.md` (sobre todo "Fuera de alcance
  explícito"), el README (cómo desplegar y la URL pública) y `explicacion.md`.
- Costos reales del mes de operación frente al dimensionamiento de la
  propuesta.
- Guion de demo para la sustentación sobre la URL pública.
- Commit: `Fase 21: cierre del proyecto`.

---

## Contratos de integración

### 1. Propiedad de archivos

| Archivo / carpeta | Dueño | Regla para el otro |
|---|---|---|
| `backend/src/payments/`, `reports/`, `catalog/`, `inventory/`, `prisma/` (servicio), `prisma/seed.ts` | Parte 1 | No tocar; pedir en el PR lo que se necesite |
| `backend/src/sync/`, `orders/`, `fiscal/`, `integrations/`, `mail/`, `frontend/src/offline/` | Parte 2 | Parte 1 coordina el contrato de `/sync` para pagos (Fase 16) |
| Dockerfiles, `docker-compose*.yml`, `nginx/`, `.github/` | Parte 2 | Parte 1 solo agrega lo de la base de datos (Fase 18) |
| `backend/prisma/schema.prisma` y migraciones | Compartido | Prefijos `r3p1_` / `r3p2_`; misma regla de orden que la ronda 2 |
| `.env.example`, `CLAUDE.md`, `README.md`, `frontend/src/App.tsx`, `frontend/src/ui/navegacion.ts` | Compartido | Solo **agregar** líneas, nunca reordenar ni borrar |

### 2. Interfaces

- **`/sync` con pagos (16 ↔ Parte 2).** Se mantiene el formato actual de
  pedidos. Los pagos llegan en un arreglo aparte, con su UUID y el consecutivo
  reservado. La respuesta por elemento sigue siendo
  `CREADO | DUPLICADO | RECHAZADO`.
- **Configuración.** Toda URL, secreto o parámetro nuevo va por variable de
  entorno y se agrega a `.env.example` (regla dura). Nada específico de un
  proveedor de nube dentro del código: solo en variables y en la
  configuración de despliegue.
- **Ambientes.** `local` (Docker Compose actual), `beta` (VPS) y, si hay
  presupuesto, `produccion`. Ninguna fase rompe `docker compose up` en local.

### 3. Flujo de ramas

Igual que la ronda 2: cada parte en su rama (`r3-parte-1` / `r3-parte-2`)
desde `main`, un commit por fase y PR a `main` revisado por el otro. Orden de
integración sugerido:

1. Fase 15 (ambos).
2. 16B y 17B, para que el CI exista antes que lo demás.
3. 16–18 de la Parte 1 y 18B–20B de la Parte 2.
4. 20 y 21.

## Resumen: qué falta para dar por concluido el proyecto

1. **Verificar y pagar deudas** (Fase 15): prueba final, pruebas automáticas
   de la Parte 2, lint.
2. **Funcionalidad de la propuesta que falta:** cobro sin conexión (Fase 16).
   Recomendado: sede por usuario (Fase 17).
3. **Llevarlo a la nube:**
   - Imágenes de producción y CI/CD (16B, 17B).
   - Base de datos y caché administradas (18).
   - Despliegue con TLS, DNS, CDN, objetos y SMTP real (18B).
   - Subdominio por cadena (19B).
   - Monitoreo (20B).
4. **Demostrarlo:** pruebas de carga y latencia (20) y cierre documental con
   costos (21).

Todo lo demás de la propuesta ya está implementado o es un simulador por
regla (DIAN y Rappi).
