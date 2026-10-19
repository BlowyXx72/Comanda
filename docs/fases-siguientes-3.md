# Fases siguientes (ronda 3) — cierre del proyecto y migración a AWS

Las rondas 1 y 2 están completas e integradas en `main` (ver
[`fases-siguientes.md`](fases-siguientes.md) y
[`fases-siguientes-2.md`](fases-siguientes-2.md)), junto con el rediseño del
frontend (PR #3 y #4). Esta ronda cierra lo que falta del prototipo, agrega
las imágenes del menú y lo lleva de Docker en un PC a la nube, como plantea la
propuesta: "servidor central en la nube" (§3.2, §6.3) y la diapositiva
"Infraestructura en la nube (producción)" de la sustentación.

**Nube elegida: AWS, con su plan gratuito**, por ser un proyecto académico. Ver
[Presupuesto: plan gratuito de AWS](#presupuesto-plan-gratuito-de-aws) antes
de crear cualquier recurso.

> **Para el Claude Code que lea esto:** respeta `CLAUDE.md` (regla de oro,
> marcas `// DECISIÓN DE PROTOTIPO` / `// TODO PRODUCCIÓN`, un commit por fase
> y pausa para mostrar avance). Trabaja **solo** en tu parte y en tu rama.
> Antes de tocar un archivo compartido, lee
> [Contratos de integración](#contratos-de-integración). No crees recursos en
> AWS sin que la persona lo confirme: cuestan créditos.

## Estado al empezar la ronda 3

| Caso de uso | Estado |
|---|---|
| CU-01 Pedido en mesa | Implementado; sin impresora ni tablet dedicada (hardware fuera de alcance). |
| CU-02 Cobro y documento fiscal | Implementado con DIAN **simulada** en segundo plano (11B). La DIAN real sigue prohibida. |
| CU-03 Menú QR | Implementado (7B), **sin imágenes de producto** (Fase 16B). |
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

## Presupuesto: plan gratuito de AWS

Condiciones vigentes para cuentas nuevas, verificadas en las fuentes oficiales
de AWS ([anuncio](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan/),
[preguntas frecuentes](https://aws.amazon.com/free/free-tier-faqs/)).
**Volver a revisarlas al crear la cuenta**, porque AWS las cambia.

- Hasta **USD 200 en créditos**: 100 al registrarse y hasta 100 más por
  completar actividades de inicio, entre ellas crear un presupuesto de costos.
- El **plan gratuito dura 6 meses** o hasta agotar los créditos, lo que pase
  primero. Además, limita el acceso a algunos servicios.
- Al vencer, **AWS suspende la cuenta**: se pierde el acceso a recursos y datos
  y se conservan 90 días para pasar al plan pago. Si se pasa al plan pago, los
  créditos que queden se siguen aplicando hasta su vencimiento.
- EC2, RDS y S3 **ya no son gratis indefinidamente** para cuentas nuevas:
  consumen los créditos. Hay más de 30 servicios "siempre gratis" aparte.

Qué significa para este proyecto:

1. **Crear la cuenta cerca de la sustentación.** Los 6 meses corren desde el
   registro, así que la nube va al final del calendario.
2. **Crear una alerta de presupuesto (AWS Budgets) el primer día**, por debajo
   de los USD 200.
3. **Apagar o destruir lo que no se use.** El balanceador de carga, la réplica
   de RDS y las IP públicas cobran por hora aunque nadie las use.
4. **Todo reproducible desde el repo** (compose de producción, guía de
   despliegue). Si la cuenta se suspende, se recrea en otra.
5. **Dos niveles, como en la sustentación**:
   - **Beta (obligatoria):** "un VPS pequeño con HTTPS". Una instancia EC2 con
     `docker-compose.prod.yml` corriendo todo, más S3 para los objetos. Cabe de
     sobra en los créditos.
   - **Producción administrada (solo si alcanza el presupuesto, y solo para la
     demo):** RDS con réplica, ElastiCache, balanceador y CloudFront. Se
     levanta unos días, se mide (Fase 19) y se apaga.

### Mapa de componentes a AWS

| Componente de la propuesta (§5.1) | Hoy en local | Beta en AWS | Producción administrada (opcional) |
|---|---|---|---|
| Proxy inverso (Nginx) | contenedor `nginx` | mismo contenedor en EC2 | Nginx en EC2 o Application Load Balancer |
| Servidores de aplicación (×2) | `backend-1`, `backend-2` | dos contenedores en la misma EC2 | dos EC2 (o ECS) detrás del balanceador |
| Trabajador + cola | `worker` + BullMQ en Redis | contenedor en EC2 | contenedor aparte |
| PostgreSQL + réplica | `postgres`, `postgres-replica` | contenedores en EC2 (con volumen y respaldo a S3) | Amazon RDS for PostgreSQL + réplica de lectura |
| Caché / Pub-Sub (Redis) | `redis` | contenedor en EC2 | Amazon ElastiCache |
| Almacén de objetos | MinIO | **Amazon S3** (solo cambian las variables `S3_*`) | Amazon S3 |
| CDN | — | opcional | Amazon CloudFront |
| Correo (SMTP) | Mailpit | Amazon SES (en *sandbox* solo envía a direcciones verificadas) | Amazon SES fuera del *sandbox* |
| TLS | autofirmado | Let's Encrypt en el Nginx de la EC2 | AWS Certificate Manager en el balanceador / CloudFront |
| DNS | — | Route 53 o el DNS del dominio | Route 53 |
| Secretos | `.env` | SSM Parameter Store | SSM Parameter Store o Secrets Manager |
| Monitoreo y logs | `docker compose logs` | Amazon CloudWatch (logs y alarmas básicas) | CloudWatch |
| Registro de imágenes | — | GHCR o Amazon ECR | Amazon ECR |

`// DECISIÓN DE PROTOTIPO`: la propuesta no nombra proveedor; AWS se elige
por el plan gratuito. El código no debe depender de AWS: todo lo específico va
en variables de entorno y en la configuración de despliegue, para que el
mismo repo siga corriendo en local con `docker compose up`.

## Antes de empezar: decisiones que hay que confirmar

1. **Región de AWS.** La propuesta estima 80–120 ms desde Bogotá a "la región
   de nube más cercana", a confirmar midiendo (§6.3). Elegir la región y
   medir en la Fase 19.
2. **Beta solamente o beta + producción administrada**, según cuántos
   créditos queden (ver arriba).
3. **Dominio.** La propuesta usa `lacadena.comandacentral.co` como ejemplo de
   subdominio por cadena (§5.2). Hace falta un dominio real (o uno gratuito de
   pruebas) para TLS válido y DNS.
4. **Herramientas y librerías nuevas.** `CLAUDE.md` exige preguntar antes de
   agregarlas:
   - Procesamiento de imágenes en el backend (p. ej. `sharp`), para la Fase 16B.
   - GitHub Actions y un registro de imágenes (GHCR o ECR), para la Fase 18B.
   - Infraestructura como código (p. ej. Terraform). Es opcional; sin ella la
     infraestructura se crea a mano siguiendo una guía en el repo.
   - Una herramienta de pruebas de carga (p. ej. k6), para la Fase 19.

**Siguen fuera de alcance**, también en AWS:

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

## Parte 1 — Funcionalidad pendiente y datos (Miguel)

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

### Fase 18 — Datos en AWS: PostgreSQL, Redis, respaldos y retención (§5.1, §4.2)

- **Beta:** Postgres y Redis siguen en contenedores en la EC2. Requisitos:
  - Volúmenes persistentes.
  - **Respaldo diario a S3** (`pg_dump` programado) con restauración
    **probada**: la sustentación pide "respaldos diarios".
- **Producción administrada (opcional):** Amazon RDS for PostgreSQL con
  réplica de lectura (reemplaza `postgres-replica`) y ElastiCache.
  - Verificar en RDS que RLS y el rol `comanda_app` funcionan igual (RDS no da
    superusuario; revisar `prisma/configurar-rol-app.ts`).
  - La réplica de RDS cobra por hora: crearla para la demo y borrarla después.
- Migraciones como **paso de despliegue único** (`prisma migrate deploy`), no
  en el arranque de cada instancia.
- **Retención de 5 años** para los XML fiscales en S3 (§4.2), con una regla de
  ciclo de vida del bucket.
- Seed solo en ambientes de prueba, nunca en producción.
- Commit: `Fase 18: datos en AWS, respaldos y retención`.

---

## Parte 2 — Imágenes del menú y despliegue en AWS (Dikersson)

### Fase 16B — Imágenes de producto en el catálogo y el menú QR (CU-03, §4.3, §5.1)

La propuesta cuenta con imágenes de menú: §4.3 calcula el ancho de banda
"dominado por imágenes de menú", y §5.1 pone "XML fiscales e imágenes" en el
almacén de objetos y en la CDN. Hoy los productos no tienen imagen.

- **Schema** (migración `r3p2_imagen_producto`): `Producto.imagenUrl`
  opcional, con la llave del objeto en el almacén (como `urlXml` de 11B).
- **Almacén compartido:** `AlmacenObjetosService` sale de `fiscal/` a un
  módulo `storage/` que exporta subir/descargar. Así lo usan fiscal e
  imágenes sin acoplarse.
- **Subida (solo ADMIN):** `POST /productos/:id/imagen` con `multipart/form-data`.
  - Valida que el producto sea de la cadena del JWT.
  - Solo acepta JPEG, PNG o WebP, de hasta 2 MB (`// DECISIÓN DE PROTOTIPO`).
  - La guarda en `productos/{cadenaId}/{productoId}-{n}.webp` y reemplaza la
    anterior.
  - Opcional, si se aprueba la librería: redimensionar y convertir a WebP
    (p. ej. 800 px y 400 px), para que el menú cargue rápido en datos móviles.
- **Entrega pública:** el menú QR no lleva JWT, así que la imagen se sirve:
  - en local, por `GET /menu/imagenes/:llave` (proxy al almacén, con caché
    HTTP larga);
  - en AWS, desde S3 detrás de CloudFront.

  El endpoint del menú devuelve la URL ya armada según el entorno (variable
  `URL_PUBLICA_IMAGENES`).
- **Frontend:**
  - `/catalogo`: control para subir o cambiar la foto, con vista previa y
    error claro si el archivo no sirve. Va en un componente aparte, para que
    `Catalogo.tsx` (Parte 1) solo gane una línea.
  - Menú QR: foto en cada tarjeta de producto.
    - `loading="lazy"`, `aspect-ratio` fijo para que no salte la página y
      texto alternativo con el nombre del producto (guías de la skill UI UX
      Pro Max).
    - Si el producto no tiene foto, se mantiene la tarjeta actual.
  - `/mesas` puede mostrar una miniatura opcional.
- **Modo sin conexión (9B):** el service worker no guarda imágenes en caché
  (solo el shell), para no llenar el teléfono.
- **Seed:** imágenes de demo para los 8 productos. Deben ser libres de
  derechos (p. ej. generadas o de un banco con licencia libre), y se anota su
  origen.
- Commit: `Fase 16B: imágenes de producto en el catálogo y el menú QR`.

### Fase 17B — Imágenes de producción y configuración por entorno

Los Dockerfiles actuales son de desarrollo (`--watch`, bind mounts).

- **Backend** multi-etapa: `nest build` → imagen con `node dist/main.js`. El
  worker usa la misma imagen con otro comando (`dist/worker.js`).
- **Frontend:** `vite build` → archivos estáticos servidos por Nginx (y luego
  por CloudFront si se usa).
- `docker-compose.prod.yml` para la beta en EC2: sin bind mounts, sin
  `--watch`, sin MinIO ni Mailpit (S3 y SES por variables) y sin puertos de
  depuración (`3000`, `5556` de Prisma Studio).
- **Endurecimiento por entorno**, todo por variables, sin cambiar código entre
  ambientes:
  - CORS restringido al dominio real (hoy `enableCors()` acepta cualquier
    origen) y Swagger apagado en producción.
  - Logs a stdout en formato estructurado.
  - Apagado ordenado de las conexiones (Socket.IO, colas).
- Commit: `Fase 17B: imágenes de producción y docker-compose.prod`.

### Fase 18B — Integración y despliegue continuos (CI/CD)

- En cada PR: `oxlint`, `tsc`, pruebas del backend (con Postgres y Redis de
  servicio) y `npm run build` del frontend. Un PR que falle no se integra.
- Al integrar a `main`: construir y publicar las imágenes (GHCR o ECR) y
  desplegar a la EC2 de la beta.
- Producción administrada, si existe, con aprobación manual.
- Acceso del CI a AWS con un rol de mínimos permisos (OIDC de GitHub), sin
  llaves de acceso guardadas.
- Commit: `Fase 18B: CI/CD con pruebas, imágenes y despliegue a AWS`.

### Fase 19B — Despliegue en AWS: red, TLS, DNS, objetos, correo y secretos (§5.1, §5.2)

- **EC2 de la beta:**
  - Instancia pequeña con Docker y un grupo de seguridad que solo abre 443 (y
    80 para redirigir y para Let's Encrypt).
  - Administración por **AWS Systems Manager Session Manager**, o SSH solo con
    llaves (§5.2).
- **TLS real:** Let's Encrypt en el Nginx (en producción administrada, ACM en
  el balanceador o en CloudFront). Con esto la PWA funciona en cualquier
  teléfono.
- **DNS:** el dominio del servicio apunta a la EC2. Los subdominios por cadena
  son la Fase 20B.
- **S3** en vez de MinIO, para los XML fiscales y las imágenes:
  - bucket privado y acceso desde la EC2 con un rol de IAM, sin llaves en el
    `.env`;
  - CloudFront opcional para las imágenes (§4.3).
- **Amazon SES** en vez de Mailpit. En la demo, el *sandbox* basta (solo a
  correos verificados). Los comprobantes siguen diciendo "documento simulado".
- **Secretos** en SSM Parameter Store (JWT, base de datos, API key de la
  plataforma, SMTP); el despliegue los vuelca al entorno de los contenedores.
- **NTP:** las EC2 sincronizan la hora con el servicio de AWS; documentarlo
  (§5.2).
- Guía `docs/despliegue-aws.md`, paso a paso, para recrear todo en otra cuenta
  si esta se suspende.
- Commit: `Fase 19B: despliegue en AWS con TLS, DNS, S3, SES y secretos`.

### Fase 20B — Subdominio por cadena (§5.2, DNS multi-tenant)

§5.2: "resolución del dominio y subdominios por cadena (multi-tenant), p. ej.
lacadena.comandacentral.co".

- DNS comodín (`*.dominio`) y certificado comodín (Let's Encrypt lo emite con
  validación por DNS).
- El backend resuelve la cadena por el `Host` en las rutas públicas (menú QR,
  domicilio, login), además del `cadena_id` del JWT.
- El QR de las mesas apunta al subdominio de la cadena.
- Commit: `Fase 20B: subdominio por cadena`.

### Fase 21B — Monitoreo, registro centralizado y alertas (§5.1, §5.2 Syslog/métricas)

- Logs de backend, worker y Nginx a **CloudWatch Logs** (equivalente a
  Syslog), con retención corta para no gastar créditos.
- Alarmas mínimas en CloudWatch:
  - Disponibilidad de `/health`.
  - Uso de CPU y disco de la EC2 (o de RDS).
  - Cola fiscal atascada (documentos `PENDIENTE` viejos).
  - Además, la alarma de presupuesto de AWS Budgets.
- Un *runbook* corto: qué hacer si cae una instancia, Redis o la base, y cómo
  restaurar un respaldo desde S3.
- Commit: `Fase 21B: monitoreo, logs centralizados y alertas en CloudWatch`.

---

## Fases finales (ambos)

### Fase 19 — Pruebas de carga y medición de latencia (§4, §6.3)

- Validar el dimensionamiento de §4: la plataforma se diseñó para **1.000
  sesiones concurrentes** y ráfagas de **~2 TPS** de ventas en la hora pico.
  En la beta (una sola EC2) se mide hasta dónde llega y se documenta. No hay
  que sostener la meta completa con la instancia más pequeña.
- Medir la latencia real desde Bogotá a la región elegida (§6.3 la deja "a
  confirmar por medición").
- Repetir la prueba de caída de una instancia (13B), ahora en AWS.
- Las pruebas de carga consumen créditos: hacerlas cortas y con presupuesto.
- Commit: `Fase 19: pruebas de carga y latencia en AWS`.

### Fase 20 — Cierre del proyecto

- Actualizar `prototipo-slice.md`, `CLAUDE.md` (sobre todo "Fuera de alcance
  explícito"), el README (cómo desplegar y la URL pública) y `explicacion.md`.
- Costo real consumido de los créditos frente al dimensionamiento de la
  propuesta.
- Guion de demo para la sustentación sobre la URL pública.
- Al terminar, decidir qué se apaga para no agotar los créditos ni pasar al
  plan pago sin querer.
- Commit: `Fase 20: cierre del proyecto`.

---

## Contratos de integración

### 1. Propiedad de archivos

| Archivo / carpeta | Dueño | Regla para el otro |
|---|---|---|
| `backend/src/payments/`, `reports/`, `catalog/`, `inventory/`, `prisma/` (servicio), `prisma/seed.ts` | Parte 1 | No tocar; pedir en el PR lo que se necesite (p. ej. imágenes demo en el seed, Fase 16B) |
| `backend/src/sync/`, `orders/`, `fiscal/`, `integrations/`, `mail/`, nuevo `storage/`, `frontend/src/offline/` | Parte 2 | Parte 1 coordina el contrato de `/sync` para pagos (Fase 16) |
| `frontend/src/pages/Catalogo.tsx`, `MenuPublico.tsx` | Parte 1 / Parte 2 | La Fase 16B agrega a `Catalogo.tsx` solo la línea del componente de subida |
| Dockerfiles, `docker-compose*.yml`, `nginx/`, `.github/`, `docs/despliegue-aws.md` | Parte 2 | Parte 1 solo agrega lo de la base de datos y los respaldos (Fase 18) |
| `backend/prisma/schema.prisma` y migraciones | Compartido | Prefijos `r3p1_` / `r3p2_`; misma regla de orden que la ronda 2 |
| `.env.example`, `CLAUDE.md`, `README.md`, `frontend/src/App.tsx`, `frontend/src/ui/navegacion.ts` | Compartido | Solo **agregar** líneas, nunca reordenar ni borrar |

### 2. Interfaces

- **`/sync` con pagos (16 ↔ Parte 2).** Se mantiene el formato actual de
  pedidos. Los pagos llegan en un arreglo aparte, con su UUID y el consecutivo
  reservado. La respuesta por elemento sigue siendo
  `CREADO | DUPLICADO | RECHAZADO`.
- **Imágenes (16B).** `GET /menu/:cadenaId/:sedeId` agrega `imagenUrl`
  (absoluta o `null`) a cada producto; `GET /productos` también. Nadie arma la
  URL en el frontend.
- **Configuración.** Toda URL, secreto o parámetro nuevo va por variable de
  entorno y se agrega a `.env.example` (regla dura). Nada específico de AWS
  dentro del código: solo en variables y en la configuración de despliegue.
- **Ambientes.** `local` (Docker Compose actual), `beta` (EC2) y, si hay
  créditos, `produccion` administrada. Ninguna fase rompe `docker compose up`
  en local.

### 3. Flujo de ramas

Igual que la ronda 2: cada parte en su rama (`r3-parte-1` / `r3-parte-2`)
desde `main`, un commit por fase y PR a `main` revisado por el otro. Orden de
integración sugerido:

1. Fase 15 (ambos).
2. 16, 17 y 16B: funcionalidad, todavía en local.
3. 17B y 18B, para que el CI exista antes de tocar AWS.
4. Crear la cuenta de AWS (cerca de la sustentación).
5. 18, 19B, 20B y 21B.
6. 19 y 20.

## Resumen: qué falta para dar por concluido el proyecto

1. **Verificar y pagar deudas** (Fase 15): prueba final, pruebas automáticas
   de la Parte 2, lint.
2. **Funcionalidad de la propuesta que falta:**
   - Imágenes en el catálogo y el menú QR (Fase 16B).
   - Cobro sin conexión (Fase 16).
   - Recomendado: sede por usuario (Fase 17).
3. **Llevarlo a AWS con el plan gratuito:**
   - Imágenes de producción y CI/CD (17B, 18B).
   - Datos y respaldos (18).
   - Despliegue de la beta en EC2 con TLS, DNS, S3, SES y secretos (19B).
   - Subdominio por cadena (20B).
   - Monitoreo con CloudWatch (21B).
4. **Demostrarlo:** pruebas de carga y latencia (19), y cierre con el costo
   real consumido y la URL pública (20).

Todo lo demás de la propuesta ya está implementado o es un simulador por
regla (DIAN y Rappi).
