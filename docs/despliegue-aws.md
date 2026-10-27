# Despliegue de la beta en AWS (Fases 18B, 19B, 20B y 21B)

Guía paso a paso para llevar Comanda Central de Docker en un PC a una EC2 con
HTTPS real, y para **recrearla en otra cuenta** si la del plan gratuito se
suspende (ver "Presupuesto" en [`fases-siguientes-3.md`](fases-siguientes-3.md)).

Todo lo que se puede preparar sin cuenta ya está en el repo, y cada parte se
probó en local (ver la última sección):

| Pieza | Archivo |
|---|---|
| Imágenes de producción | `backend/Dockerfile`, `nginx/Dockerfile.prod` |
| Ambiente beta | `docker-compose.prod.yml`, `.env.prod.example` |
| Probarlo en el PC | `docker-compose.prod.local.yml` |
| CI/CD | `.github/workflows/ci.yml`, `.github/workflows/despliegue.yml` |
| Arranque de la EC2 | `deploy/ec2-user-data.sh` |
| Secretos desde SSM | `deploy/env-desde-ssm.sh` |
| Despliegue | `deploy/desplegar.sh` |
| Certificado de Let's Encrypt | `deploy/certificado.sh` |
| Permisos mínimos de IAM | `deploy/iam/*.json` |

> **Reglas.**
> - No crear recursos sin que el equipo lo confirme: cuestan créditos.
> - La DIAN y Rappi siguen siendo simuladores también en AWS (CLAUDE.md, reglas duras).
> - Los correos siguen diciendo "documento simulado".

## Arquitectura de la beta

```
Navegador / teléfono ──HTTPS (TLS 1.3, HTTP/2, WSS)──▶ EC2 (Elastic IP, DNS del dominio)
                                                         └─ Docker Compose (docker-compose.prod.yml)
                                                             ├─ nginx      80/443, frontend compilado, Let's Encrypt
                                                             ├─ backend-1, backend-2   (Socket.IO con backplane Redis)
                                                             ├─ worker     colas fiscal, acuses y correo
                                                             ├─ postgres + postgres-replica   (RLS, réplica para reportes)
                                                             └─ redis      (AOF)
EC2 ──rol de IAM──▶ S3 (XML fiscales, fotos) · SSM Parameter Store (secretos) · CloudWatch (21B)
worker ──SMTP 587──▶ Amazon SES
GitHub Actions ──OIDC──▶ rol de despliegue ──SSM Run Command──▶ EC2 (deploy/desplegar.sh)
GitHub Actions ──▶ GHCR (imágenes)  ◀── EC2 hace pull
```

Solo los puertos 80 y 443 están abiertos a internet. La administración va por
**Session Manager** de Systems Manager, sin SSH (§5.2).

## 0. Antes de empezar: decisiones

1. **Región.** La propuesta pide medir la latencia desde Bogotá (§6.3, Fase 19).
   - `us-east-1` (Virginia) suele ser la más barata y tiene todos los servicios.
   - `sa-east-1` (São Paulo) puede estar más cerca, pero es más cara.

   Medir antes de decidir, p. ej. con `ping` o con
   [cloudping](https://www.cloudping.info) desde Bogotá. En esta guía la región
   aparece como `REGION`.
2. **Dominio.** Hace falta uno para el certificado real y para la Fase 20B.
   Puede ser uno de Route 53 o de cualquier registrador. Aquí: `comanda.ejemplo.co`.
3. **Cuenta de AWS** creada cerca de la sustentación: el plan gratuito dura 6 meses.

## 1. Cuenta y presupuesto (primer día)

1. Crear la cuenta en el **plan gratuito** y activar MFA en el usuario raíz.
2. **AWS Budgets → Create budget → Cost budget** de USD 50, con alertas al 50 %,
   80 % y 100 % al correo del equipo. Esto además suma créditos (actividad de
   inicio del plan gratuito).
3. Crear un usuario de IAM para el día a día (no usar el raíz) y elegir la región.

## 2. Buckets de S3

Dos buckets privados (los nombres son globales en AWS; agregar un sufijo
propio):

| Bucket | Contenido | Variable |
|---|---|---|
| `comanda-documentos-<sufijo>` | XML fiscales (simulados) | `S3_BUCKET` |
| `comanda-imagenes-<sufijo>` | Fotos de producto (Fase 16B) | `S3_BUCKET_IMAGENES` |
| `comanda-respaldos-<sufijo>` | `pg_dump` diarios (Fase 18, [`datos-aws.md`](datos-aws.md)) | `RESPALDO_S3_BUCKET` |

- Los dos con **Block all public access** activado. Las fotos las sirve el
  backend (con caché en Nginx) o CloudFront (paso 9). El bucket nunca se hace
  público.
- **Retención de 5 años de los XML (§4.2):** es de la Fase 18 (Parte 1). Una
  regla de ciclo de vida en `comanda-documentos-*` que los pase a Glacier y
  los expire a los 5 años.

## 3. Rol de IAM de la EC2

1. **IAM → Roles → Create role → AWS service: EC2.**
2. Adjuntar la política administrada **`AmazonSSMManagedInstanceCore`**
   (Session Manager y Run Command).
3. Agregar una política en línea con el contenido de
   [`deploy/iam/ec2-rol-politica.json`](../deploy/iam/ec2-rol-politica.json),
   reemplazando `BUCKET_DOCUMENTOS`, `BUCKET_IMAGENES`, `BUCKET_RESPALDOS`,
   `REGION` y `CUENTA`.

   Esa política solo permite:
   - leer, escribir y borrar en los dos buckets;
   - leer los parámetros `/comanda/beta/*`;
   - escribir logs en `/comanda/beta*` (Fase 21B).
4. Nombre sugerido: `comanda-beta-ec2`.

Con el rol, el backend usa S3 **sin llaves**: en `.env.prod` no van ni
`S3_ENDPOINT` ni `S3_ACCESS_KEY` (ver `AlmacenObjetosService`).

## 4. Secretos en SSM Parameter Store

Cada variable de [`.env.prod.example`](../.env.prod.example) se crea como un
parámetro bajo `/comanda/beta/`:

- **SecureString** para los secretos (claves, `JWT_SECRET`, la API key, las
  credenciales SMTP, las URL de base de datos);
- **String** para el resto.

`deploy/env-desde-ssm.sh` arma `.env.prod` con ellos en cada despliegue.

```bash
# Ejemplo (desde CloudShell, que ya tiene la CLI con tus permisos):
P=/comanda/beta
aws ssm put-parameter --name $P/JWT_SECRET --type SecureString --value "$(openssl rand -base64 32)"
aws ssm put-parameter --name $P/DOMINIO --type String --value comanda.ejemplo.co
aws ssm put-parameter --name $P/S3_FORCE_PATH_STYLE --type String --value false
# ... una por cada línea de .env.prod.example (DATABASE_URL lleva la misma
# clave que POSTGRES_PASSWORD; DATABASE_URL_APP y DATABASE_URL_REPLICA, la misma
# clave de comanda_app).
```

Opcional: `CORREO_LETSENCRYPT` (avisos de vencimiento del certificado).

Los parámetros estándar son gratis.

## 5. Correo con Amazon SES

1. **SES → Identities → Create identity**: el dominio, con los registros DKIM
   en el DNS. Para la demo basta verificar el correo remitente.
2. En **sandbox**, SES solo entrega a direcciones verificadas: verificar los
   correos del equipo y del docente. Salir del sandbox no hace falta.
3. **SMTP settings → Create SMTP credentials.** Guardar usuario y clave en
   `SMTP_USER` y `SMTP_PASS` (SecureString). El host es
   `email-smtp.REGION.amazonaws.com`, puerto 587 y `SMTP_SECURE=false`
   (STARTTLS).

## 6. La EC2

1. **EC2 → Launch instance:**
   - **AMI:** Amazon Linux 2023 (x86_64).
   - **Tipo:** `t3.small`, 2 GB de RAM. El script agrega 2 GB de swap; `t3.micro`
     se queda corto con dos backends y Postgres con réplica.
   - **Disco:** 20 GB gp3.
   - **Par de llaves:** ninguno, porque se entra por Session Manager.
   - **Grupo de seguridad:** entrada **solo TCP 80 y 443** desde `0.0.0.0/0`;
     sin el 22.
   - **Metadata options:** IMDSv2 obligatorio y **hop limit 2**, para que los
     contenedores lleguen a las credenciales del rol.
   - **Advanced details → IAM instance profile:** `comanda-beta-ec2`.
   - **User data:** el contenido de
     [`deploy/ec2-user-data.sh`](../deploy/ec2-user-data.sh). Instala Docker,
     clona el repo en `/opt/comanda`, activa chrony con el Amazon Time Sync
     Service (§5.2 NTP), crea el swap y programa la renovación del certificado.
2. **Elastic IP → Allocate → Associate** a la instancia, para que la IP no
   cambie al reiniciar. Las IP públicas cobran por hora: soltarla al destruir
   la beta.
3. **DNS:** registro `A` de `comanda.ejemplo.co` a la Elastic IP (Route 53 o
   el DNS del dominio).

## 7. Imágenes en GHCR y primer despliegue

1. Integrar a `main`: el workflow **Despliegue** publica
   `ghcr.io/blowyxx72/comanda-backend`, `-backend-migrate` y `-nginx`.
2. En GitHub, en el perfil de quien publica → **Packages**, poner cada uno en
   **Public**. Así la EC2 los descarga sin credenciales. Las imágenes no
   llevan secretos: `.env*` está en `.dockerignore`.
3. Entrar a la instancia: **EC2 → Connect → Session Manager**, y:

   ```bash
   sudo -iu ec2-user
   /opt/comanda/deploy/desplegar.sh latest    # arma .env.prod desde SSM, pull, migrate, up --wait
   /opt/comanda/deploy/certificado.sh emitir  # Let's Encrypt (el DNS ya debe apuntar a la EC2)
   ```

   Hasta emitir el certificado, Nginx usa uno provisional autofirmado (el
   navegador avisa).
4. **No correr el seed en la beta**. Si la demo necesita datos, cargarlos a mano
   o con un script propio. `prisma db seed` y `seed:imagenes` son solo para
   ambientes de prueba.

## 8. Despliegue continuo desde GitHub (Fase 18B)

1. **IAM → Identity providers → Add provider → OpenID Connect:**
   `https://token.actions.githubusercontent.com`, audiencia `sts.amazonaws.com`.
2. **IAM → Roles → Create role → Web identity** con ese proveedor:
   - relación de confianza:
     [`deploy/iam/github-oidc-confianza.json`](../deploy/iam/github-oidc-confianza.json).
     Solo el environment `beta` del repo `BlowyXx72/Comanda` puede asumirlo.
   - permisos:
     [`deploy/iam/github-despliegue-politica.json`](../deploy/iam/github-despliegue-politica.json).
     Solo `ssm:SendCommand` sobre esa instancia y leer el resultado.
3. En el repo:
   - **Settings → Environments → New environment `beta`.** Ahí se puede exigir
     aprobación manual.
   - **Settings → Secrets and variables → Actions → Variables:**
     `DESPLIEGUE_HABILITADO=true`, `AWS_REGION`, `AWS_ROLE_ARN` y
     `EC2_INSTANCE_ID`.
4. Desde ahí, cada integración a `main` con el CI en verde publica las
   imágenes y corre `deploy/desplegar.sh <commit>` en la EC2 por SSM.
5. **Settings → Branches → regla para `main`:** "Require status checks to
   pass" con los trabajos del CI. Así un PR en rojo no se integra.

## 9. CloudFront para las fotos (opcional, §4.3)

Sin CloudFront, las fotos las sirve el backend y Nginx las cachea, lo que
basta para la beta. Para la CDN de la propuesta:

1. **CloudFront → Create distribution:**
   - origen: el bucket `comanda-imagenes-*`, con **Origin access control** (el
     bucket sigue privado);
   - caché: `CachingOptimized`.
2. Aplicar al bucket la política que propone CloudFront.
3. Parámetro `URL_PUBLICA_IMAGENES=https://dxxxx.cloudfront.net`, y volver a
   desplegar.

   Las llaves de las fotos son inmutables (`productos/{cadena}/{producto}-{versión}-{400|800}.webp`),
   así que no hay que invalidar nada al cambiar una foto.

## 10. Subdominio por cadena (Fase 20B, §5.2)

Cada cadena entra por su subdominio, p. ej. `demo.comanda.ejemplo.co`
(`Cadena.subdominio`; la del seed es `demo`). Por el subdominio de una cadena:

- el menú QR y el domicilio solo muestran y aceptan esa cadena (otro
  `cadenaId` da 404);
- el login solo acepta a sus usuarios (otro da el mismo 401 que una clave
  mala);
- los QR de las mesas apuntan a `https://<subdominio>.dominio/menu/<sede>?mesa=N`,
  y la URL la arma el backend (`GET /cadena`).

Por el dominio principal todo sigue igual que antes.

1. **DNS:** además del `A` de `comanda.ejemplo.co`, un registro comodín `A` de
   `*.comanda.ejemplo.co` a la misma Elastic IP. Para el certificado comodín,
   la zona tiene que estar en **Route 53**.
2. **Permisos:** las dos declaraciones `CertificadoComodin*` de
   [`deploy/iam/ec2-rol-politica.json`](../deploy/iam/ec2-rol-politica.json),
   con el `ID_ZONA` de la zona hospedada.
3. **Metadatos de la instancia:** en EC2 → Actions → Instance settings →
   *Modify instance metadata options*, **hop limit = 2**. Sin esto los
   contenedores no alcanzan las credenciales del rol, ni el backend (S3) ni
   certbot (Route 53).
4. Parámetro `URL_PUBLICA_CADENA=https://{subdominio}.comanda.ejemplo.co`, y
   volver a desplegar.
5. Certificado comodín (reemplaza al del paso 7; las renovaciones siguen solas):

   ```bash
   /opt/comanda/deploy/certificado.sh comodin   # DOMINIO y *.DOMINIO, validando por DNS
   ```

En local se prueba con `URL_PUBLICA_CADENA=https://{subdominio}.localhost:8443`
en el `.env`: los navegadores resuelven `*.localhost` solos y el certificado
de desarrollo ya cubre `*.localhost`. Con eso se abre
`https://demo.localhost:8443/menu/<sedeId>`.

## 11. Monitoreo, logs y alertas (Fase 21B)

- **Logs:** en la EC2, `deploy/desplegar.sh` suma `docker-compose.prod.aws.yml`
  (porque `COMANDA_CLOUDWATCH=true`).
  - Los logs de todos los contenedores van a CloudWatch Logs, grupo
    `/comanda/beta`, un stream por contenedor y retención de 7 días. Es el
    equivalente al Syslog de §5.2.
  - Backend y worker escriben JSON (`LOG_FORMATO=json`, Fase 17B).
- **Métricas:**
  - CPU y chequeos de estado: los da EC2.
  - Memoria y disco: el agente de CloudWatch, que instala `ec2-user-data.sh`
    con [`deploy/cloudwatch/agente.json`](../deploy/cloudwatch/agente.json).
  - Colas: el worker publica cada minuto los documentos fiscales atascados y
    los trabajos en espera y fallidos de cada cola. Usa el formato EMF, sin
    SDK; ver `backend/src/monitoring/`.
- **Alarmas:** desde CloudShell, una vez:

  ```bash
  REGION=us-east-1 INSTANCIA=i-0123... CORREO=equipo@ejemplo.co DOMINIO=comanda.ejemplo.co     sh deploy/cloudwatch/crear-alarmas.sh
  ```

  Crea las alarmas de instancia caída, CPU, disco, memoria, cola fiscal
  atascada (o worker sin reportar) y sin servicio (chequeo HTTPS de Route 53
  a `/api/health`), con aviso por correo. Qué hacer con cada una:
  [`runbook.md`](runbook.md).

## 12. Verificación

```bash
# Desde la EC2 (Session Manager), contra el dominio real:
docker run --rm -e URL_BASE=https://comanda.ejemplo.co -e MAILPIT_URL= \
  -e PLATAFORMA_SIMULADA_API_KEY=<la del SSM> \
  ghcr.io/blowyxx72/comanda-backend-migrate:latest node scripts/prueba-integracion.mjs
```

- La prueba recorre los flujos de punta a punta. Necesita datos en la base;
  sin correo de Mailpit, las verificaciones de correo se omiten.
- Revisar además:
  - el candado del navegador (Let's Encrypt);
  - `https://comanda.ejemplo.co/api/docs` → 404 (Swagger apagado);
  - la PWA instalable desde un teléfono.

## 13. Apagar y destruir (para no gastar créditos)

| Qué | Cuándo | Cómo |
|---|---|---|
| Detener la EC2 | Entre sesiones de trabajo | EC2 → Instance state → Stop (el disco sigue cobrando poco) |
| Elastic IP | Al destruir | Disassociate + Release |
| EC2 y disco | Al cerrar el proyecto | Terminate |
| Buckets | Al cerrar | Vaciar y borrar |
| CloudFront | Al cerrar | Disable y luego Delete |
| Parámetros SSM, roles, OIDC | Al cerrar | Borrar (no cuestan, pero no dejan nada colgando) |
| Alarmas, chequeo de Route 53, temas SNS, grupo de logs | Al cerrar | Borrar (el chequeo de Route 53 cobra por mes) |

Antes de destruir:

- un `pg_dump` de la base, si se quiere conservar (Fase 18);
- poner `DESPLIEGUE_HABILITADO=false` en GitHub.

## Lo que ya se probó en local

- **Imágenes de producción:**
  - backend de 618 MB, sin la CLI de Prisma;
  - Nginx de 84 MB, con el frontend compilado.
- **`docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml up --wait`:**
  todo healthy. La prueba de punta a punta dio "TODO OK" por Nginx.
- **Endurecimiento:**
  - Swagger devuelve 404;
  - CORS solo responde al origen configurado;
  - `http` → `https` (301);
  - caché inmutable de `/assets`;
  - logs JSON;
  - apagado ordenado en menos de 1 s.
- **Scripts:**
  - `deploy/*.sh` pasan `shellcheck`;
  - `env-desde-ssm.sh` probado con un `aws` simulado: comillas, `$` y barras
    llegan intactas al contenedor.
- **Workflows:** validados con `actionlint`.
- **Pendiente de la cuenta de AWS:**
  - todo lo que crea recursos (pasos 1 a 9);
  - la emisión real del certificado;
  - la ejecución por SSM.
