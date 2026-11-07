# Tutorial: migrar Comanda Central a AWS con la cuenta del plan gratuito

Guía paso a paso para llevar Comanda Central de Docker en el PC a un servidor
en Amazon Web Services (AWS), con HTTPS real, correo, respaldos y monitoreo.
Está pensada para hacerse a mano, sin experiencia previa en AWS, y para
convertirla después en un documento de Word.

- **Tiempo estimado:** 3 a 4 horas la primera vez, contando esperas
  (verificación de la cuenta, arranque del servidor, certificado).
- **Costo esperado:** de USD 0 a USD 21 al mes, cubiertos por los créditos
  del plan gratuito (ver la sección 2).
- **Quién lo hace:** quien vaya a ser dueño de la cuenta de AWS. Las partes
  de GitHub marcadas como opcionales las hace el dueño del repositorio
  (la cuenta `BlowyXx72`) o alguien con permiso de administrador en él.

> **Reglas del proyecto que siguen vigentes en la nube.** La DIAN y Rappi
> siguen siendo **simuladores**: no se conecta nada real. Los correos siguen
> diciendo "documento simulado". El código no cambia entre el PC y AWS: solo
> cambian las variables de configuración.

---

## Índice

1. Qué vas a construir
2. Costos y créditos: lo que hay que saber antes de empezar
3. Qué archivos del proyecto se usan y dónde están
4. Hoja de datos (llénala mientras avanzas)
5. Paso 0. Preparativos en el PC y en GitHub
6. Paso 1. Crear la cuenta de AWS (plan gratuito)
7. Paso 2. Proteger la cuenta: MFA y usuario administrador
8. Paso 3. Presupuesto y alertas de costo
9. Paso 4. Reservar la IP fija (Elastic IP)
10. Paso 5. Dominio gratuito con DuckDNS
11. Paso 6. Crear los tres buckets de S3
12. Paso 7. Rol de permisos para el servidor (IAM)
13. Paso 8. Correo con Amazon SES
14. Paso 9. Preparar el archivo `.env.prod` en el PC
15. Paso 10. Guardar los secretos en SSM Parameter Store (CloudShell)
16. Paso 11. Grupo de logs en CloudWatch
17. Paso 12. Grupo de seguridad (firewall)
18. Paso 13. Lanzar el servidor EC2
19. Paso 14. Entrar al servidor con Session Manager y revisar que quedó bien
20. Paso 15. Primer despliegue
21. Paso 16. Cargar los datos de demostración
22. Paso 17. Certificado HTTPS de Let's Encrypt
23. Paso 18. Probar todo
24. Paso 19. Respaldos
25. Paso 20. Monitoreo y alarmas
26. Paso 21 (opcional). Despliegue automático desde GitHub
27. Uso diario: apagar, encender, actualizar, ver logs
28. Al terminar el proyecto: destruir todo
29. Anexo A. Todas las variables de `.env.prod`
30. Anexo B. Solución de problemas
31. Anexo C. Dominio propio y certificado comodín (opcional)
32. Anexo D. Glosario
33. Anexo E. Lista de verificación final

---

## 1. Qué vas a construir

Un solo servidor virtual (una **instancia EC2**) que corre con Docker
exactamente las mismas piezas que corren hoy en el PC, más los servicios de
AWS que reemplazan a MinIO y a Mailpit:

```
Navegador / teléfono
   │  https://comanda-dk26.duckdns.org   (TLS 1.3, HTTP/2, WebSocket seguro)
   ▼
EC2 t3.small (Amazon Linux 2023) con IP fija (Elastic IP)
   └── Docker Compose (docker-compose.prod.yml)
        ├── nginx ............ puertos 80 y 443, frontend compilado, certificado
        ├── backend-1, backend-2 ... API NestJS + Socket.IO
        ├── worker ........... colas: DIAN simulada, plataforma, correo
        ├── postgres ......... base de datos (con RLS)
        ├── postgres-replica . réplica de lectura para reportes
        ├── redis ............ colas y tiempo real
        └── respaldo ......... copia diaria de la base a S3

La EC2 usa, con un rol de permisos (sin contraseñas guardadas):
   ├── S3 ..................... XML fiscales, fotos de productos, respaldos
   ├── SSM Parameter Store .... los secretos (claves, JWT, SMTP)
   ├── SES .................... envío de correos (comprobantes, resumen)
   └── CloudWatch ............. logs centralizados, métricas y alarmas

Afuera de AWS (gratis):
   ├── DuckDNS ................ el nombre de dominio
   ├── Let's Encrypt .......... el certificado HTTPS
   └── GitHub (GHCR) .......... las imágenes Docker ya compiladas
```

**Cómo llega el código al servidor.** No se sube nada desde el PC:

- Al arrancar, el servidor **clona el repositorio público de GitHub** en
  `/opt/comanda`. Ahí quedan los `docker-compose`, los scripts y la
  configuración.
- Las **imágenes Docker ya compiladas** las publicó GitHub Actions en GitHub
  Container Registry y son públicas: el servidor las descarga.

| Imagen | Qué contiene |
|---|---|
| `ghcr.io/blowyxx72/comanda-backend` | backend y worker |
| `ghcr.io/blowyxx72/comanda-backend-migrate` | migraciones y seed |
| `ghcr.io/blowyxx72/comanda-nginx` | Nginx con el frontend compilado |
| `ghcr.io/blowyxx72/comanda-respaldo` | respaldos de la base |

**Cómo se entra al servidor.** No se usa SSH ni llaves `.pem`. Se entra
desde el navegador con **AWS Systems Manager Session Manager**, que es más
seguro: el servidor no tiene el puerto 22 abierto.

---

## 2. Costos y créditos: lo que hay que saber antes de empezar

### 2.1 Cómo funciona el plan gratuito (cuentas nuevas desde julio de 2025)

Datos tomados de la documentación oficial de AWS (páginas *AWS Free Tier*,
*FAQs* y *Free Tier Terms*). **Revísalos de nuevo el día que crees la cuenta**,
porque AWS los cambia.

- **Créditos:** AWS da **USD 100** al crear la cuenta y **hasta USD 100 más**
  por completar actividades de inicio. Las actividades aparecen en el widget
  *Explore AWS* de la página de inicio de la consola; dos de ellas son crear
  un presupuesto y lanzar una instancia EC2, que este tutorial hace de todas
  formas.
- **Duración:** el plan gratuito termina a los **6 meses** de crear la cuenta
  **o** cuando se acaban los créditos, lo que pase primero. No se puede
  extender.
- **Qué pasa al terminar:**
  1. AWS **suspende la cuenta** y se pierde el acceso a los recursos.
  2. Guarda los datos **90 días**. En ese plazo se puede pasar al plan pago y
     recuperar todo.
  3. Después de los 90 días **cierra la cuenta y borra todo**.
- **Restricciones:** el plan gratuito no permite servicios que gastarían todos
  los créditos de golpe, como instancias reservadas, *Savings Plans* o ciertas
  ofertas de AWS Marketplace. Nada de eso hace falta aquí.
- **Instancias permitidas** ("Free Tier eligible", cuentas desde el
  15/07/2025): `t3.micro`, `t3.small`, `t4g.micro`, `t4g.small`,
  `c7i-flex.large` y `m7i-flex.large`. Este tutorial usa **`t3.small`**.
- Las cuentas del plan gratuito son "para evaluación", no para datos
  sensibles reales. Para una demo académica con datos de prueba está bien.

**Consecuencia práctica:** crea la cuenta **cerca de la sustentación**. Si
falta mucho, los 6 meses pueden vencer antes de tiempo.

### 2.2 Cuánto cuesta cada pieza (región `us-east-1`, precios aproximados)

Los precios son de referencia; confírmalos en la calculadora oficial,
https://calculator.aws. Todos se descuentan de los créditos.

| Recurso | Precio aproximado | Encendido 24/7 (mes) | Apagado todo el mes |
|---|---|---|---|
| EC2 `t3.small` (2 vCPU, 2 GB) | USD 0,0208 por hora | ~USD 15,20 | USD 0 |
| Disco EBS gp3 de 20 GB | USD 0,08 por GB al mes | ~USD 1,60 | ~USD 1,60 (se cobra igual) |
| Elastic IP (IPv4 pública) | USD 0,005 por hora | ~USD 3,65 | ~USD 3,65 (se cobra igual) |
| S3 (unos MB de XML, fotos y respaldos) | USD 0,023 por GB al mes | < USD 0,10 | < USD 0,10 |
| SES (correos) | USD 0,10 por cada 1.000 | ~USD 0 | USD 0 |
| CloudWatch (logs, 6 alarmas, ~9 métricas) | parte entra en lo gratuito | USD 0 a 3 | ~USD 0 |
| Chequeo de salud de Route 53 | gratis o ~USD 0,50 al mes | ~USD 0,50 | ~USD 0,50 |
| SSM Parameter Store (parámetros estándar) | gratis | USD 0 | USD 0 |
| Transferencia de datos de salida | los primeros 100 GB al mes son gratis | USD 0 | USD 0 |
| DuckDNS, Let's Encrypt, GitHub, GHCR | gratis (fuera de AWS) | USD 0 | USD 0 |
| **Total aproximado** | | **~USD 21 al mes** | **~USD 6 al mes** |

Escenarios con USD 200 de créditos:

- **Encendido 24/7 durante 6 meses:** ~USD 126. Alcanza, y sobran ~USD 70.
- **Encendido solo cuando trabajan** (unas 8 horas al día, 5 días a la
  semana): ~USD 10 al mes, unos USD 60 en 6 meses.
- **Solo con los USD 100 iniciales y encendido 24/7:** alcanza para unos 4,5
  meses. Por eso conviene ganar los créditos extra (paso 3) y apagar la
  instancia cuando no se use (sección 27).
- **Día de pruebas de carga** (Fase 19, opcional): cambiar temporalmente a
  `c7i-flex.large` cuesta ~USD 0,085 por hora, unos USD 2 por día.

### 2.3 Trampas de costo que este tutorial evita a propósito

**No crees** estos recursos aunque la consola los sugiera:

| Recurso | Por qué no |
|---|---|
| **NAT Gateway** | ~USD 33 al mes |
| **Load Balancer** (ALB/NLB) | ~USD 16 al mes o más |
| **RDS** (base de datos administrada) | USD 15 a 30 al mes |
| **ElastiCache** | La beta usa Redis en un contenedor |
| Instancias más grandes que `t3.small` | Salvo el día de la prueba de carga, y apagándolas después |
| Snapshots de disco | Se acumulan y cobran |

La **Elastic IP cobra aunque el servidor esté apagado**. Si destruyes el
servidor, **libera también la IP**.

---

## 3. Qué archivos del proyecto se usan y dónde están

Todas las rutas son relativas a la carpeta del repositorio en tu PC
(`C:\Users\<tu usuario>\Documents\Comanda`).

| Archivo | Para qué sirve | Qué haces con él |
|---|---|---|
| `.env.prod.example` | Plantilla con todas las variables del servidor | La copias a `.env.prod` en la misma carpeta y la llenas (paso 9) |
| `.env.prod` (lo creas tú) | Tus valores reales: claves, nombres de buckets, dominio | Lo **subes a CloudShell** solo para cargarlo en SSM y lo borras de allá (paso 10). **Nunca** va a GitHub: ya está en `.gitignore` |
| `deploy/ec2-user-data.sh` | Script que prepara el servidor al arrancar: Docker, el repo, la hora, el swap, el agente de CloudWatch | Copias **todo su texto** y lo pegas en el campo *User data* al lanzar la EC2 (paso 13) |
| `deploy/iam/ec2-rol-politica.json` | Permisos mínimos del servidor | Referencia. En el paso 7 está la versión lista para pegar |
| `deploy/iam/github-oidc-confianza.json` | Confianza para que GitHub Actions entre a AWS sin llaves | Solo si haces el paso 21 (opcional) |
| `deploy/iam/github-despliegue-politica.json` | Permiso de GitHub Actions para desplegar | Solo si haces el paso 21 (opcional) |
| `deploy/cloudwatch/crear-alarmas.sh` | Crea las alarmas y el aviso por correo | **No lo subes:** en CloudShell se descarga directo de GitHub (paso 20) |
| `deploy/desplegar.sh` | Descarga las imágenes y levanta todo | No lo subes: el servidor lo trae al clonar el repo; lo ejecutas allá (paso 15) |
| `deploy/env-desde-ssm.sh` | Arma `.env.prod` en el servidor a partir de SSM | No lo subes: lo usa `desplegar.sh` solo |
| `deploy/certificado.sh` | Pide y renueva el certificado HTTPS | No lo subes: lo ejecutas en el servidor (paso 17) |
| `docker-compose.prod.yml` | Los servicios de producción | No lo subes: viene con el repo |
| `docker-compose.prod.aws.yml` | Manda los logs a CloudWatch | No lo subes: lo suma `desplegar.sh` |
| `docker-compose.prod.local.yml` | Probar producción en el PC (con MinIO y Mailpit) | Opcional, antes de migrar (paso 0) |
| `postgres/` | Configuración de la réplica y del contenedor de respaldos | No lo subes: viene con el repo |
| `docs/despliegue-aws.md` | Referencia técnica del despliegue | Para consultar |
| `docs/runbook.md` | Qué hacer cuando algo falla | Tenlo a mano |
| `docs/datos-aws.md` | Respaldos y retención (Fase 18) | Para consultar |

**Resumen:** lo único que sale de tu PC hacia AWS es el **contenido** de
`.env.prod` (a SSM, pasando por CloudShell) y el **texto** de
`deploy/ec2-user-data.sh` (pegado en la consola). Todo lo demás lo trae el
servidor desde GitHub.

---

## 4. Hoja de datos (llénala mientras avanzas)

Copia esta tabla en un archivo aparte (**no** en el repo) y ve completándola.
Los pasos siguientes te dicen cuándo anotar cada dato. Los valores entre `< >`
de este documento se reemplazan por estos.

| Dato | Ejemplo | Tu valor | Paso |
|---|---|---|---|
| Correo de la cuenta raíz de AWS | `comanda.aws@gmail.com` | | 1 |
| ID de la cuenta (12 dígitos, `<ID_CUENTA>`) | `123456789012` | | 2 |
| Usuario administrador de IAM | `admin-dikersson` | | 2 |
| URL de inicio de sesión de IAM | `https://123456789012.signin.aws.amazon.com/console` | | 2 |
| Región | `us-east-1` | `us-east-1` | 2 |
| Elastic IP (`<IP_ELASTICA>`) | `3.85.10.20` | | 4 |
| Dominio (`<TU_DOMINIO>`) | `comanda-dk26.duckdns.org` | | 5 |
| Sufijo de los buckets (`<SUFIJO>`) | `dk26` | | 6 |
| Bucket de documentos | `comanda-documentos-dk26` | | 6 |
| Bucket de imágenes | `comanda-imagenes-dk26` | | 6 |
| Bucket de respaldos | `comanda-respaldos-dk26` | | 6 |
| Nombre del rol de la EC2 | `comanda-beta-ec2` | | 7 |
| Correo remitente verificado en SES | `equipo.comanda@gmail.com` | | 8 |
| Usuario SMTP de SES | `AKIA...` | | 8 |
| Clave SMTP de SES | (secreta) | | 8 |
| ID de la instancia (`<ID_INSTANCIA>`) | `i-0abc123def4567890` | | 13 |

---

## 5. Paso 0. Preparativos en el PC y en GitHub

### 0.1 Lo que necesitas

- Una **tarjeta de crédito o débito** a tu nombre que permita compras
  internacionales. AWS hace un cobro de verificación temporal de ~USD 1 que
  luego devuelve.
- Un **correo** que no hayas usado antes en AWS. Recomendado: uno del equipo,
  por ejemplo `comanda.aws@gmail.com`, para no atar la cuenta a una persona.
- Un **celular** para el código de verificación y la app de autenticación
  (Google Authenticator o Microsoft Authenticator).
- El **PC con el repositorio** actualizado (`git pull` en `main`) y Git Bash,
  que trae `openssl` para generar claves.
- Una cuenta de **GitHub o Google** para entrar a DuckDNS.

### 0.2 Que `main` en GitHub tenga la última versión

El servidor clona la rama `main` de GitHub, no tu PC. Antes de lanzar la EC2,
confirma en https://github.com/BlowyXx72/Comanda que:

1. `deploy/ec2-user-data.sh` contenga `releases/latest/download` y
   `AWS_DEFAULT_REGION`.
2. `deploy/certificado.sh` mencione `DOMINIOS_EXTRA`.
3. En la pestaña **Actions**, el último *workflow* **Despliegue** de `main`
   esté en verde. Eso confirma que las imágenes de GHCR están actualizadas.

Si falta algo, primero hay que integrar esos cambios a `main`.

### 0.3 (Recomendado) Probar la versión de producción en el PC

Así detectas errores antes de gastar créditos. Desde la raíz del repo, en Git
Bash:

```bash
cp .env.prod.example .env.prod
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod up -d --build --wait
```

1. Abre https://localhost:9443. Acepta la advertencia del certificado:
   es provisional.
2. Cuando termines, bájalo:

   ```bash
   docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod down -v
   ```
3. Borra ese `.env.prod` de prueba. En el paso 9 vas a crear el real.

---

## 6. Paso 1. Crear la cuenta de AWS (plan gratuito)

1. Entra a https://aws.amazon.com y haz clic en **Create an AWS account**
   (o **Comenzar gratis** si la página está en español).
2. **Root user email address:** el correo del equipo. **AWS account name:**
   `comanda-central`. Clic en **Verify email address**.
3. Revisa el correo, copia el **código de verificación** y pégalo.
4. Crea la **contraseña del usuario raíz**. Que sea larga y guárdala en un
   lugar seguro. Este usuario puede hacer y pagar cualquier cosa.
5. **Elige el plan:** marca **Free plan** (plan gratuito), **no** *Paid plan*.
6. **Contact information:**
   - **How do you plan to use AWS?** → *Personal*.
   - Nombre, teléfono con indicativo `+57`, país **Colombia**, dirección y
     ciudad.
   - Acepta el acuerdo de cliente.
7. **Billing information:** los datos de la tarjeta. Puede aparecer un cobro
   temporal de verificación (~USD 1) que se reversa.
8. **Confirm your identity:** elige SMS o llamada, escribe tu celular y el
   captcha, y luego el código que llega.
9. **Select a support plan:** **Basic support – Free**. Clic en **Complete
   sign up**.
10. Espera el correo de confirmación ("Welcome to Amazon Web Services"). La
    activación puede tardar de minutos a algunas horas.
11. Entra a https://console.aws.amazon.com con **Root user** y el correo.

**Anota** en la hoja de datos el correo raíz.

---

## 7. Paso 2. Proteger la cuenta: MFA y usuario administrador

### 2.1 MFA en el usuario raíz (obligatorio)

1. Arriba a la derecha, clic en el **nombre de la cuenta** → **Security
   credentials** (Credenciales de seguridad).
2. En **Multi-factor authentication (MFA)** → **Assign MFA device**.
3. Nombre: `celular-raiz`. Tipo: **Authenticator app** → **Next**.
4. Abre Google Authenticator o Microsoft Authenticator en el celular,
   escanea el código QR y escribe **dos códigos seguidos** → **Add MFA**.

### 2.2 Anotar el ID de la cuenta

Arriba a la derecha, el menú de la cuenta muestra **Account ID**: 12 dígitos,
por ejemplo `1234-5678-9012`. Anótalo **sin guiones** (`123456789012`) como
`<ID_CUENTA>`.

### 2.3 Permitir que los usuarios de IAM vean la facturación

Por defecto solo el usuario raíz ve los costos y los créditos.

1. Menú de la cuenta → **Account**.
2. Baja a **IAM user and role access to Billing information** → **Edit**.
3. Marca **Activate IAM Access** → **Update**.

### 2.4 Crear el usuario administrador del día a día

No se trabaja con el usuario raíz.

1. En la barra de búsqueda de arriba escribe **IAM** y entra.
2. Menú izquierdo **Users** → **Create user**.
3. **User name:** `admin-dikersson`. Marca **Provide user access to the AWS
   Management Console** → **I want to create an IAM user**.
4. **Custom password:** una contraseña segura. Desmarca *Users must create a
   new password at next sign-in* (opcional) → **Next**.
5. **Permissions options:** **Attach policies directly** → busca y marca
   **AdministratorAccess** → **Next** → **Create user**.
6. En la pantalla final, copia el **Console sign-in URL**, del estilo
   `https://123456789012.signin.aws.amazon.com/console`, y anótalo.
7. (Opcional) Repite para Miguel (`admin-miguel`).
8. **Cierra sesión del raíz** y entra con la URL anotada, el usuario
   `admin-dikersson` y su contraseña.
9. Asígnale MFA también a este usuario: IAM → Users → `admin-dikersson` →
   **Security credentials** → **Assign MFA device**, igual que en 2.1.

### 2.5 Elegir la región

Arriba a la derecha, al lado del nombre de usuario, está el selector de
región. Elige **US East (N. Virginia) us-east-1**.

- **Todo** lo de este tutorial se crea en esa región. Si un recurso "no
  aparece", casi siempre es porque la consola cambió de región.
- IAM y Route 53 son globales y no dependen de la región.
- Se elige `us-east-1` porque es la más barata y tiene todos los servicios.
  Además, las métricas de los chequeos de salud de Route 53 solo existen ahí.
  La latencia desde Bogotá se mide en la Fase 19.

---

## 8. Paso 3. Presupuesto y alertas de costo

Hazlo **antes** de crear cualquier recurso. Además da créditos extra.

### 3.1 Ganar los créditos extra

En la página de inicio de la consola (**Console Home**) busca el widget
**Explore AWS** con el filtro *Earn AWS credits*. Empieza desde ahí las
actividades que vas a hacer de todas formas, como *Set up a cost budget* o
*Launch an instance*, para que cuenten. Los créditos tardan hasta 30 minutos
en aparecer en **Billing and Cost Management → Credits**.

### 3.2 Presupuesto mensual que mide el gasto real

1. Busca **Billing and Cost Management** → menú izquierdo **Budgets** →
   **Create budget**.
2. **Budget setup:** **Customize (advanced)**. **Budget types:** **Cost
   budget** → **Next**.
3. **Budget name:** `comanda-mensual`.
4. **Period:** *Monthly*. **Renewal type:** *Recurring budget*.
   **Budgeting method:** *Fixed*. **Enter your budgeted amount:** `25` (USD).
5. **Budget scope:** *All AWS services*.
6. Abre **Advanced options** → **Supported charge types** y **desmarca
   Credits** (y *Refunds*). Así el presupuesto mide el consumo real y no
   queda en cero mientras los créditos lo pagan. Sin este cambio, las alertas
   nunca sonarían.
7. **Next** → **Add an alert threshold**. Crea tres:

   | Umbral | Tipo |
   |---|---|
   | 50 % | *Actual* (real) |
   | 80 % | *Actual* (real) |
   | 100 % | *Forecasted* (pronosticado) |

   En cada una, en **Email recipients**, el correo del equipo.
8. **Next** → **Next** → **Create budget**.

### 3.3 Alertas del plan gratuito

**Billing and Cost Management** → **Billing preferences** (Preferencias) →
**Alert preferences** → activa **Receive AWS Free Tier alerts** con tu correo
→ **Update**. AWS avisa cuando un servicio pasa el 85 % de su límite
gratuito.

### 3.4 Dónde ver los créditos que quedan

**Billing and Cost Management** → **Credits**. Ahí aparece el saldo y la
fecha de vencimiento. Revísalo una vez por semana.

---

## 9. Paso 4. Reservar la IP fija (Elastic IP)

El dominio se apunta a una IP que no cambie aunque el servidor se reinicie.

1. Busca **EC2** → menú izquierdo **Network & Security** → **Elastic IPs** →
   **Allocate Elastic IP address**.
2. **Public IPv4 address pool:** *Amazon's pool of IPv4 addresses* →
   **Allocate**.
3. Selecciónala → **Actions** → **Manage tags** → agrega `Name` =
   `comanda-beta-ip` → **Save**.
4. **Anota la IP** (por ejemplo `3.85.10.20`) como `<IP_ELASTICA>`.

**Costo:** desde este momento cobra ~USD 0,005 por hora (~USD 3,65 al mes),
esté o no asociada a un servidor.

---

## 10. Paso 5. Dominio gratuito con DuckDNS

Se usa DuckDNS porque es gratis y porque Let's Encrypt trata cada subdominio
de DuckDNS como un dominio aparte (está en la *Public Suffix List*). Así otros
usuarios del servicio no te agotan el límite de certificados.

1. Entra a https://www.duckdns.org e inicia sesión con **GitHub** o
   **Google**.
2. En **sub domain** escribe un nombre único, por ejemplo `comanda-dk26`, y
   haz clic en **add domain**.
3. En la fila del dominio, en **current ip**, escribe la `<IP_ELASTICA>` y
   haz clic en **update ip**.
4. Anota `<TU_DOMINIO>` = `comanda-dk26.duckdns.org`.
5. Comprueba que ya resuelve, desde Git Bash en el PC:

   ```bash
   nslookup comanda-dk26.duckdns.org 8.8.8.8
   nslookup demo.comanda-dk26.duckdns.org 8.8.8.8
   ```

   Las dos deben devolver tu `<IP_ELASTICA>`. La segunda es el **subdominio de
   la cadena "demo"** (Fase 20B). Si `demo.` no resuelve, el resto funciona
   igual: deja `URL_PUBLICA_CADENA` y `DOMINIOS_EXTRA` vacíos en el paso 9.

> **¿Prefieres un dominio propio** (`comandacentral.co`, etc.)? Ver el
> Anexo C. Cuesta entre USD 3 y 15 al año, y puede que los créditos no cubran
> la compra del dominio.

---

## 11. Paso 6. Crear los tres buckets de S3

Los nombres de bucket son **únicos en todo el mundo**. Por eso llevan un
sufijo tuyo, por ejemplo `dk26` (anótalo como `<SUFIJO>`).

| Bucket | Qué guarda |
|---|---|
| `comanda-documentos-<SUFIJO>` | XML fiscales simulados (privado) |
| `comanda-imagenes-<SUFIJO>` | Fotos de los productos del menú (privado; las sirve el backend) |
| `comanda-respaldos-<SUFIJO>` | Copias diarias de la base de datos (privado) |

### 6.1 Crear cada bucket (repetir 3 veces)

1. Busca **S3** → **Create bucket**.
2. **Bucket type:** *General purpose*. **Bucket name:** por ejemplo
   `comanda-documentos-dk26`. **AWS Region:** *US East (N. Virginia)
   us-east-1*.
3. **Object Ownership:** *ACLs disabled (recommended)*.
4. **Block Public Access settings:** deja marcado **Block all public
   access**. Ningún bucket es público.
5. **Bucket Versioning:** *Disable*. **Default encryption:** *SSE-S3*.
6. **Object Lock:** *Disable*.
7. **Create bucket**.

### 6.2 Reglas de retención (ciclo de vida)

**XML fiscales, 5 años (§4.2 de la propuesta):**

1. Entra a `comanda-documentos-<SUFIJO>` → pestaña **Management** → **Create
   lifecycle rule**.
2. **Lifecycle rule name:** `retencion-xml-5-anios`.
3. **Choose a rule scope:** *Limit the scope of this rule using one or more
   filters* → **Prefix:** `fiscal/`.
4. **Lifecycle rule actions:** marca **Expire current versions of objects**.
5. **Days after object creation:** `1827`.
6. **Create rule**.

> La regla aplica a los XML guardados bajo `fiscal/`. Que el código los guarde
> con ese prefijo es un pendiente de la Parte 2 (ver
> `docs/ronda3-parte1-pendientes.md`). Mientras no esté, la regla no borra
> nada, y eso no daña nada.

**Respaldos, 30 días:**

1. Entra a `comanda-respaldos-<SUFIJO>` → **Management** → **Create
   lifecycle rule**.
2. Nombre: `retencion-respaldos-30-dias`. **Prefix:** `postgres/`.
3. **Expire current versions of objects:** `30` días → **Create rule**.

---

## 12. Paso 7. Rol de permisos para el servidor (IAM)

El servidor no guarda contraseñas de AWS: usa un **rol** con permisos
mínimos.

### 7.1 Crear la política

1. **IAM** → **Policies** → **Create policy** → pestaña **JSON**.
2. Borra lo que trae y pega esto. Antes de pegar, reemplaza:
   - `<ID_CUENTA>` por tu ID de 12 dígitos;
   - `<SUFIJO>` por tu sufijo, en los tres buckets.

   Es `deploy/iam/ec2-rol-politica.json` sin las líneas de Route 53, que solo
   sirven para el dominio propio del Anexo C.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DocumentosImagenesYRespaldos",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": [
        "arn:aws:s3:::comanda-documentos-<SUFIJO>/*",
        "arn:aws:s3:::comanda-imagenes-<SUFIJO>/*",
        "arn:aws:s3:::comanda-respaldos-<SUFIJO>/*"
      ]
    },
    {
      "Sid": "ListarYVerificarBuckets",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": [
        "arn:aws:s3:::comanda-documentos-<SUFIJO>",
        "arn:aws:s3:::comanda-imagenes-<SUFIJO>",
        "arn:aws:s3:::comanda-respaldos-<SUFIJO>"
      ]
    },
    {
      "Sid": "SecretosDeComanda",
      "Effect": "Allow",
      "Action": ["ssm:GetParametersByPath", "ssm:GetParameter", "ssm:GetParameters"],
      "Resource": "arn:aws:ssm:us-east-1:<ID_CUENTA>:parameter/comanda/beta/*"
    },
    {
      "Sid": "DescifrarSecretos",
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "*",
      "Condition": { "StringEquals": { "kms:ViaService": "ssm.us-east-1.amazonaws.com" } }
    },
    {
      "Sid": "LogsDeCloudWatch",
      "Effect": "Allow",
      "Action": ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"],
      "Resource": "arn:aws:logs:us-east-1:<ID_CUENTA>:log-group:/comanda/beta*"
    },
    {
      "Sid": "MetricasDelAgente",
      "Effect": "Allow",
      "Action": "cloudwatch:PutMetricData",
      "Resource": "*",
      "Condition": { "StringEquals": { "cloudwatch:namespace": "CWAgent" } }
    }
  ]
}
```

3. **Next**. **Policy name:** `comanda-beta-ec2-politica` → **Create
   policy**.

### 7.2 Crear el rol y asignarle las políticas

1. **IAM** → **Roles** → **Create role**.
2. **Trusted entity type:** *AWS service*. **Use case:** **EC2** → **Next**.
3. Busca y marca estas **tres** políticas:
   - `comanda-beta-ec2-politica` (la que acabas de crear);
   - `AmazonSSMManagedInstanceCore`, para entrar con Session Manager sin SSH;
   - `CloudWatchAgentServerPolicy`, para el agente de memoria y disco.
4. **Next** → **Role name:** `comanda-beta-ec2` → **Create role**.

---

## 13. Paso 8. Correo con Amazon SES

Las cuentas nuevas empiezan en **sandbox**: SES solo envía **desde** y
**hacia** direcciones verificadas. Para la demo alcanza; no hace falta pedir
salir del sandbox.

### 8.1 Verificar los correos

1. Busca **Amazon Simple Email Service (SES)**. Confirma que la región sea
   **us-east-1**. Si aparece un asistente *Get started*, puedes cerrarlo.
2. Menú izquierdo **Configuration** → **Identities** → **Create identity**.
3. **Identity type:** *Email address*. **Email address:** el correo
   **remitente**, por ejemplo `equipo.comanda@gmail.com` → **Create
   identity**.
4. Abre ese correo y haz clic en el enlace de verificación. La identidad debe
   quedar en **Verified**.
5. Repite con **cada correo que deba recibir** mensajes en la demo:
   - el de la cuenta ADMIN del resumen diario;
   - los correos que usen en los pedidos a domicilio;
   - el del docente, si va a probar.

   Cada persona debe hacer clic en el enlace que le llega.

> **Sin dominio propio no hay DKIM.** Gmail u Outlook pueden mandar los
> correos a **spam**. Para la demo, revisa la carpeta de spam y márcalos como
> "No es spam".

### 8.2 Crear las credenciales SMTP

1. En SES, menú izquierdo **SMTP settings**. Anota el **SMTP endpoint**:
   `email-smtp.us-east-1.amazonaws.com`, puerto **587** (STARTTLS).
2. **Create SMTP credentials** → deja el nombre que propone → **Create user**.
3. Aparecen **SMTP user name** y **SMTP password**. **Descarga el CSV**: la
   clave **no se vuelve a mostrar**.

   Ojo: no son las llaves de acceso normales de AWS. Son credenciales solo
   para SMTP.
4. Anota en la hoja de datos el usuario SMTP y guarda la clave en un lugar
   seguro.

---

## 14. Paso 9. Preparar el archivo `.env.prod` en el PC

Este archivo contiene **todas** las variables del servidor. Se arma en el PC,
se carga a AWS en el paso 10 y después se borra de CloudShell.

1. En Git Bash, en la carpeta del repo:

   ```bash
   cp .env.prod.example .env.prod
   code .env.prod        # o ábrelo con el editor que uses
   ```

2. **Genera las claves secretas.** Usa siempre `-hex`: el formato base64 trae
   `/`, `+` y `=`, que rompen las URL de conexión a la base. Corre esto 5
   veces y guarda cada resultado:

   ```bash
   openssl rand -hex 24
   ```

   | Para | Variable |
   |---|---|
   | Clave de Postgres | `POSTGRES_PASSWORD` |
   | Clave del rol de la app | `comanda_app` |
   | Clave de replicación | `POSTGRES_REPLICATION_PASSWORD` |
   | Secreto de los tokens | `JWT_SECRET` |
   | Llave del simulador de plataforma | `PLATAFORMA_SIMULADA_API_KEY` |

3. **Reemplaza los valores** (tabla completa en el Anexo A). Lo esencial:

   ```dotenv
   DOMINIO=comanda-dk26.duckdns.org
   CORS_ORIGENES=https://comanda-dk26.duckdns.org,https://demo.comanda-dk26.duckdns.org
   URL_PUBLICA_CADENA=https://{subdominio}.comanda-dk26.duckdns.org
   DOMINIOS_EXTRA=demo.comanda-dk26.duckdns.org
   CORREO_LETSENCRYPT=equipo.comanda@gmail.com

   POSTGRES_PASSWORD=<clave1>
   DATABASE_URL="postgresql://comanda:<clave1>@postgres:5432/comanda?schema=public"
   DATABASE_URL_APP="postgresql://comanda_app:<clave2>@postgres:5432/comanda?schema=public"
   POSTGRES_REPLICATION_PASSWORD=<clave3>
   DATABASE_URL_REPLICA="postgresql://comanda_app:<clave2>@postgres-replica:5432/comanda?schema=public"

   JWT_SECRET=<clave4>
   PLATAFORMA_SIMULADA_API_KEY=<clave5>

   RESPALDO_S3_BUCKET=comanda-respaldos-dk26
   S3_BUCKET=comanda-documentos-dk26
   S3_BUCKET_IMAGENES=comanda-imagenes-dk26

   SMTP_USER=<usuario SMTP de SES>
   SMTP_PASS=<clave SMTP de SES>
   SMTP_FROM="Comanda Central <equipo.comanda@gmail.com>"
   ```

4. **Revisa estas tres coincidencias.** Son el error más común:
   - `<clave1>` es **la misma** en `POSTGRES_PASSWORD` y dentro de
     `DATABASE_URL`;
   - `<clave2>` es **la misma** en `DATABASE_URL_APP` y en
     `DATABASE_URL_REPLICA`;
   - el correo de `SMTP_FROM` es uno **verificado** en SES.

5. **No toques** estas variables:
   - `REGISTRO=ghcr.io/blowyxx72`, `TAG=latest`, `AMBIENTE=beta`;
   - `AWS_REGION=us-east-1`, `S3_REGION=us-east-1`,
     `S3_FORCE_PATH_STYLE=false`, `NODE_ENV=production`;
   - `SWAGGER_HABILITADO=false`, `LOG_FORMATO=json`.

   **No agregues** `S3_ENDPOINT`, `S3_ACCESS_KEY` ni `S3_SECRET_KEY`: en AWS
   el servidor entra a S3 con su rol, sin llaves.

6. Guarda el archivo. **Nunca lo subas a GitHub.** Ya está en `.gitignore`;
   compruébalo con `git status`, que no debe listarlo.

---

## 15. Paso 10. Guardar los secretos en SSM Parameter Store (CloudShell)

Cada línea de `.env.prod` se convierte en un parámetro cifrado bajo
`/comanda/beta/`. El servidor los lee en cada despliegue con
`deploy/env-desde-ssm.sh`. Así los secretos no quedan copiados a mano en
ningún servidor.

1. En la consola de AWS, región `us-east-1`, haz clic en el ícono
   **CloudShell** (`>_`) de la barra de arriba. Se abre una terminal Linux en
   el navegador, gratis y con la CLI de AWS ya configurada con tus permisos.
2. Menú **Actions** (arriba a la derecha de CloudShell) → **Upload file** →
   elige el `.env.prod` de la carpeta del repo en tu PC. Queda en la carpeta
   de inicio de CloudShell.
3. Pega este bloque completo y presiona Enter:

   ```bash
   PREFIJO=/comanda/beta
   grep -E '^[A-Z_][A-Z0-9_]*=' .env.prod | while IFS= read -r linea; do
     clave="${linea%%=*}"
     valor="${linea#*=}"
     valor="${valor%\"}"; valor="${valor#\"}"
     if [ -z "$valor" ]; then echo "  (vacío, se omite) $clave"; continue; fi
     aws ssm put-parameter --name "$PREFIJO/$clave" --type SecureString \
       --value "$valor" --overwrite >/dev/null && echo "  ok $clave"
   done
   ```

   Debe mostrar `ok` para cada variable. Las vacías, como
   `URL_PUBLICA_IMAGENES`, se omiten, y está bien.
4. Verifica cuántos quedaron. Deben ser unos 45:

   ```bash
   aws ssm get-parameters-by-path --path /comanda/beta/ --query 'length(Parameters)'
   ```

5. Revisa uno, por ejemplo el dominio:

   ```bash
   aws ssm get-parameter --name /comanda/beta/DOMINIO --with-decryption --query Parameter.Value --output text
   ```

6. **Borra el archivo de CloudShell:**

   ```bash
   rm .env.prod
   ```

7. Para cambiar un valor después, en CloudShell:

   ```bash
   aws ssm put-parameter --name /comanda/beta/NOMBRE --type SecureString --value "nuevo valor" --overwrite
   ```

   Luego vuelve a desplegar (sección 27).

También puedes ver los parámetros en la consola: **Systems Manager** →
**Parameter Store**.

---

## 16. Paso 11. Grupo de logs en CloudWatch

Los contenedores mandan sus logs a CloudWatch, y el grupo **debe existir
antes del primer despliegue**. Si no existe, los contenedores no arrancan.

1. Busca **CloudWatch** → menú izquierdo **Logs** → **Log groups** →
   **Create log group**.
2. **Log group name:** `/comanda/beta`, con la barra inicial.
   **Retention setting:** *1 week (7 days)*, para no gastar.
3. **Create**.

---

## 17. Paso 12. Grupo de seguridad (firewall)

1. **EC2** → menú izquierdo **Network & Security** → **Security Groups** →
   **Create security group**.
2. **Security group name:** `comanda-beta-web`. **Description:** `Web
   publica de Comanda (solo 80 y 443)`. **VPC:** la *default*.
3. **Inbound rules** → **Add rule** dos veces:

   | Type | Port | Source |
   |---|---|---|
   | HTTP | 80 | *Anywhere-IPv4* (`0.0.0.0/0`) |
   | HTTPS | 443 | *Anywhere-IPv4* (`0.0.0.0/0`) |

   **No** agregues SSH (22).
4. **Outbound rules:** deja la que trae (todo el tráfico de salida).
5. **Create security group**.

El puerto 80 hace falta para que Let's Encrypt valide el dominio y para
redirigir a HTTPS.

---

## 18. Paso 13. Lanzar el servidor EC2

1. **EC2** → **Instances** → **Launch instances**.
2. **Name:** `comanda-beta`.
3. **Application and OS Images:** **Amazon Linux** → **Amazon Linux 2023
   AMI** (con la etiqueta *Free tier eligible*).

   **Architecture: 64-bit (x86)**, **no** *Arm*. Las imágenes de GHCR son
   x86; en una instancia `t4g` (ARM) no arrancan.
4. **Instance type:** **t3.small** (*Free tier eligible*).
5. **Key pair (login):** *Proceed without a key pair (Not recommended)*. Se
   entra por Session Manager, no por SSH.
6. **Network settings** → **Edit**:
   - **VPC:** *default*. **Subnet:** *No preference*.
   - **Auto-assign public IP:** **Enable**. Al arrancar, el servidor necesita
     internet antes de que le asocies la Elastic IP, para descargar Docker y
     clonar el repo.
   - **Firewall (security groups):** *Select existing security group* →
     `comanda-beta-web`.
7. **Configure storage:** **20 GiB**, tipo **gp3**.
8. Abre **Advanced details** y configura:
   - **IAM instance profile:** `comanda-beta-ec2`.
   - **Metadata accessible:** *Enabled*.
   - **Metadata version:** *V2 only (token required)*.
   - **Metadata response hop limit:** **2**. Es imprescindible: con 1, los
     contenedores no alcanzan los permisos del rol y S3 responde *Access
     Denied*.
   - **User data:** abre `deploy/ec2-user-data.sh` en tu PC, **copia todo**
     y pégalo en el cuadro, como texto. Confirma que diga
     `REPO_URL="https://github.com/BlowyXx72/Comanda.git"` y
     `SSM_PREFIJO="/comanda/beta/"`.
9. A la derecha, en **Summary**: *Number of instances* = 1 → **Launch
   instance**.
10. Clic en el ID de la instancia, del estilo `i-0abc...`. Anótalo como
    `<ID_INSTANCIA>`.

### 13.1 Asociar la Elastic IP

1. **EC2** → **Elastic IPs** → selecciona `comanda-beta-ip` → **Actions** →
   **Associate Elastic IP address**.
2. **Resource type:** *Instance*. **Instance:** `comanda-beta` →
   **Associate**.
3. En **Instances**, la columna **Public IPv4 address** de `comanda-beta` debe
   mostrar tu `<IP_ELASTICA>`.

### 13.2 Esperar a que termine de prepararse

El *user data* tarda de **5 a 10 minutos**: instala Docker, clona el repo,
crea el swap e instala el agente de CloudWatch. Mientras tanto, la columna
**Status check** pasa de *Initializing* a *2/2 checks passed*.

---

## 19. Paso 14. Entrar al servidor con Session Manager y revisar que quedó bien

1. **EC2** → **Instances** → selecciona `comanda-beta` → **Connect** →
   pestaña **Session Manager** → **Connect**.

   Si dice que no se puede conectar, espera 2 o 3 minutos más; ver el
   Anexo B, problema 1.
2. Se abre una terminal en el navegador con el usuario `ssm-user`. Pásate al
   usuario de trabajo, que carga las variables de Comanda:

   ```bash
   sudo -iu ec2-user
   ```

3. Revisa que el arranque terminó bien:

   ```bash
   sudo tail -n 20 /var/log/cloud-init-output.log
   ```

   Al final no debe haber errores. Busca líneas de `git clone` y
   `amazon-cloudwatch-agent`.
4. Revisa las piezas:

   ```bash
   cat /etc/profile.d/comanda.sh
   docker --version && docker compose version
   free -h
   ls /opt/comanda
   aws ssm get-parameters-by-path --path /comanda/beta/ --query 'length(Parameters)'
   ```

   | Comando | Qué debe mostrar |
   |---|---|
   | `cat /etc/profile.d/comanda.sh` | `COMANDA_SSM_PREFIJO=/comanda/beta/`, `COMANDA_CLOUDWATCH=true` y `AWS_DEFAULT_REGION=us-east-1` |
   | `docker --version && docker compose version` | Las versiones de Docker y de Docker Compose |
   | `free -h` | Swap de **2,0Gi** |
   | `ls /opt/comanda` | Los archivos del repo (`docker-compose.prod.yml`, `deploy`...) |
   | `aws ssm get-parameters-by-path ...` | El mismo número del paso 10 (~45); eso confirma que el rol lee SSM |

---

## 20. Paso 15. Primer despliegue

En la terminal de Session Manager, como `ec2-user`:

```bash
cd /opt/comanda
./deploy/desplegar.sh latest
```

**Qué hace, en orden:**

1. Actualiza el repo (`git pull`).
2. Arma `.env.prod` desde SSM.
3. Descarga las imágenes de GHCR (~2 GB la primera vez).
4. Crea la base y aplica las migraciones (servicio `migrate`).
5. Levanta los 8 servicios y **espera a que todos estén sanos**.

Tarda de **3 a 8 minutos** la primera vez. Al final muestra la lista de
servicios con su estado.

**Si termina con error,** mira qué servicio falló:

```bash
C="docker compose -f docker-compose.prod.yml -f docker-compose.prod.aws.yml --env-file .env.prod"
$C ps
$C logs --tail=50 <servicio>      # p. ej. backend-1, migrate, nginx
```

Los casos típicos están en el **Anexo B**.

**Prueba rápida:** en el navegador del PC abre `http://<TU_DOMINIO>`.

1. Debe redirigir a `https://` con una **advertencia de certificado**: todavía
   es el provisional, y se arregla en el paso 17.
2. Acepta la advertencia (*Avanzado → Continuar*) y debe aparecer la pantalla
   de login.

---

## 21. Paso 16. Cargar los datos de demostración

La base está vacía: no hay usuarios ni productos. Para la demo se cargan los
mismos datos que en el PC. **El seed borra todo lo que haya**: córrelo solo
esta vez, o cuando quieras reiniciar la demo.

```bash
cd /opt/comanda
C="docker compose -f docker-compose.prod.yml -f docker-compose.prod.aws.yml --env-file .env.prod"
$C run --rm migrate npx prisma db seed
$C run --rm migrate npm run seed:imagenes
```

- El primer comando crea:
  - la cadena "Demo", con subdominio `demo`;
  - 3 sedes con 6 mesas cada una;
  - los usuarios `admin@demo.com`, `cajero@demo.com` y `mesero@demo.com`;
  - 8 productos con recetas e inventario;
  - la integración de la plataforma simulada.
- El segundo sube las fotos de los 8 productos al bucket de imágenes. Si falla
  con *Access Denied*, es el *hop limit* (Anexo B, problema 4).

**Cambia las contraseñas de demo** si el enlace va a ser público por mucho
tiempo. Las de `admin123`, `cajero123` y `mesero123` son conocidas.

---

## 22. Paso 17. Certificado HTTPS de Let's Encrypt

**Requisitos:**

- `<TU_DOMINIO>`, y `demo.<TU_DOMINIO>` si lo usas, ya resuelven a la
  `<IP_ELASTICA>` (paso 5);
- el puerto 80 está abierto (paso 12);
- Nginx está corriendo (paso 15).

```bash
cd /opt/comanda
./deploy/certificado.sh emitir
```

- Pide **un** certificado para `<TU_DOMINIO>` y para lo que haya en
  `DOMINIOS_EXTRA`, en este caso `demo.<TU_DOMINIO>`.
- Al final dice `Successfully received certificate` y reinicia Nginx.
- Abre `https://<TU_DOMINIO>`: ahora debe aparecer el **candado** sin
  advertencia.
- La **renovación es automática**: un cron la intenta dos veces al día, y
  Let's Encrypt solo renueva cuando faltan menos de 30 días. Puedes revisar el
  log con `cat /var/log/comanda-certificado.log`.

Si falla, ver el Anexo B, problema 6.

---

## 23. Paso 18. Probar todo

### 18.1 En el navegador

| Prueba | Cómo | Debe pasar |
|---|---|---|
| Login | `https://<TU_DOMINIO>` con `admin@demo.com` / `admin123` | Entra a la pantalla de inicio |
| Mesero | Otra ventana de incógnito con `mesero@demo.com` | Ve las mesas y puede crear un pedido |
| Cocina | Como admin, abre **Cocina** | El pedido del mesero aparece **sin recargar** (tiempo real) |
| Caja | Marca el pedido LISTO y cóbralo como `cajero@demo.com` | Sale el documento "PENDIENTE" y en segundos cambia a validado (DIAN simulada) |
| Panel | Como admin, abre **Panel** | La venta aparece en vivo |
| Inventario | Como admin, abre **Inventario** | Los insumos bajaron al crear el pedido |
| Fotos | Abre **Catálogo** y el menú QR | Los productos tienen foto |
| Menú QR en el celular | En **Mesas** → *Códigos QR del menú*, escanea uno con el celular, con datos o con otra red | Abre `https://demo.<TU_DOMINIO>/menu/...` con candado |
| Domicilio con correo | En el menú QR haz un pedido a domicilio con un correo **verificado en SES**; luego cóbralo en caja | Llega el comprobante (revisa spam) |
| Swagger apagado | `https://<TU_DOMINIO>/api/docs` | Responde 404, como debe ser en producción |

### 18.2 Prueba automática de punta a punta

Desde Session Manager:

```bash
cd /opt/comanda
C="docker compose -f docker-compose.prod.yml -f docker-compose.prod.aws.yml --env-file .env.prod"
$C run --rm -e URL_BASE=https://<TU_DOMINIO> -e MAILPIT_URL= migrate node scripts/prueba-integracion.mjs
```

- Debe terminar en **`TODO OK`**.
- Las verificaciones de correo se omiten, porque no hay Mailpit en AWS.
- La prueba crea pedidos de prueba y manda correos a direcciones
  `@example.com`, que SES rechaza en sandbox. En el log del worker vas a ver
  esos rechazos: es normal.
- **Guarda una captura** del resultado: es evidencia para la sustentación.

---

## 24. Paso 19. Respaldos

El servicio `respaldo` ya está corriendo y hace un `pg_dump` diario a las
03:00 de Bogotá (08:00 UTC). Pruébalo una vez a mano:

```bash
cd /opt/comanda
C="docker compose -f docker-compose.prod.yml -f docker-compose.prod.aws.yml --env-file .env.prod"
$C run --rm respaldo respaldar
```

Comprueba en **S3** → `comanda-respaldos-<SUFIJO>` → carpeta `postgres/` que
apareció un archivo `comanda-<fecha>.dump`.

**Prueba de restauración (recomendada, evidencia de la Fase 18).** Restaura en
una base aparte, sin tocar la de la app:

```bash
$C run --rm -e RESTAURAR_DB=comanda_prueba respaldo restaurar
```

Para una recuperación real, ver `docs/datos-aws.md` (sección 3) y
`docs/runbook.md`.

---

## 25. Paso 20. Monitoreo y alarmas

### 20.1 Crear las alarmas (una vez, desde CloudShell)

Abre CloudShell (`>_`) y pega esto, reemplazando tus datos:

```bash
curl -fsSLO https://raw.githubusercontent.com/BlowyXx72/Comanda/main/deploy/cloudwatch/crear-alarmas.sh
REGION=us-east-1 INSTANCIA=<ID_INSTANCIA> CORREO=equipo.comanda@gmail.com \
  DOMINIO=<TU_DOMINIO> sh crear-alarmas.sh
```

**El script:**

1. Confirma el grupo de logs con retención de 7 días.
2. Crea un tema SNS que avisa por correo.
3. Crea 6 alarmas:

   | Alarma | Cuándo suena |
   |---|---|
   | Instancia caída | La EC2 falla sus chequeos de estado |
   | CPU alta | Más del 80 % por 10 minutos |
   | Disco lleno | Más del 85 % |
   | Memoria alta | Más del 90 % por 10 minutos |
   | Cola fiscal atascada | Documentos PENDIENTE hace más de 5 minutos, o el worker dejó de reportar |
   | Sin servicio | `https://<TU_DOMINIO>/api/health` no responde (chequeo de Route 53) |

**Importante:**

- Llega un correo *AWS Notification – Subscription Confirmation*: haz clic en
  **Confirm subscription**. Sin eso no recibes avisos.
- En **CloudWatch → Alarms** las alarmas aparecen en *Insufficient data* y a
  los ~10 minutos pasan a **OK**.

### 20.2 Ver los logs centralizados

**CloudWatch** → **Log groups** → `/comanda/beta`. Hay un *stream* por
contenedor (`comanda-backend-1-1`, `comanda-worker-1`, etc.).

Para buscar errores: **Logs Insights** → elige `/comanda/beta` → pega esta
consulta → **Run query**:

```
fields @timestamp, context, message
| filter level = "error" or level = "warn"
| sort @timestamp desc
| limit 50
```

Qué hacer cuando suena cada alarma: `docs/runbook.md`.

---

## 26. Paso 21 (opcional). Despliegue automático desde GitHub

Con esto, cada vez que se integra algo a `main` y el CI queda en verde,
GitHub publica las imágenes y actualiza el servidor solo. Sin este paso, se
actualiza a mano con `desplegar.sh` (sección 27).

**Requiere ser administrador del repositorio** (`BlowyXx72`), porque hay que
entrar a *Settings*.

### 21.1 En AWS: el proveedor de identidad de GitHub

**IAM** → **Identity providers** → **Add provider**:

- **Provider type:** *OpenID Connect*.
- **Provider URL:** `https://token.actions.githubusercontent.com`.
- **Audience:** `sts.amazonaws.com`.

Luego **Add provider**.

### 21.2 En AWS: el rol que usa GitHub

1. **IAM** → **Roles** → **Create role** → **Custom trust policy** y pega el
   contenido de `deploy/iam/github-oidc-confianza.json`, reemplazando
   `CUENTA` por tu `<ID_CUENTA>`. Solo el *environment* `beta` del repo
   `BlowyXx72/Comanda` puede usar este rol.
2. **Next** → sin políticas → **Next** → **Role name:**
   `comanda-github-despliegue` → **Create role**.
3. Entra al rol → **Add permissions** → **Create inline policy** → **JSON** y
   pega `deploy/iam/github-despliegue-politica.json`, reemplazando:
   - `REGION` por `us-east-1`;
   - `CUENTA` por tu `<ID_CUENTA>`;
   - `ID_INSTANCIA` por tu `<ID_INSTANCIA>`.

   El rol solo puede mandarle el comando de despliegue a esa instancia.
4. Nombre: `comanda-github-despliegue-politica` → **Create policy**.
5. Copia el **ARN** del rol, del estilo
   `arn:aws:iam::123456789012:role/comanda-github-despliegue`.

### 21.3 En GitHub

1. Repo → **Settings** → **Environments** → **New environment** → nombre
   `beta` → **Configure environment**. Opcional: **Required reviewers**, para
   aprobar cada despliegue a mano.
2. **Settings** → **Secrets and variables** → **Actions** → pestaña
   **Variables** → **New repository variable**, cuatro veces:

   | Name | Value |
   |---|---|
   | `DESPLIEGUE_HABILITADO` | `true` |
   | `AWS_REGION` | `us-east-1` |
   | `AWS_ROLE_ARN` | el ARN del paso 21.2 |
   | `EC2_INSTANCE_ID` | tu `<ID_INSTANCIA>` |

3. Prueba: **Actions** → **Despliegue** → **Run workflow**. El trabajo
   *Desplegar en la beta (EC2)* debe terminar en verde y mostrar la salida de
   `desplegar.sh`.

---

## 27. Uso diario: apagar, encender, actualizar, ver logs

| Quiero... | Cómo |
|---|---|
| **Apagar** para ahorrar (entre sesiones de trabajo) | EC2 → Instances → `comanda-beta` → **Instance state → Stop**. Siguen cobrando el disco y la IP (~USD 5 al mes). **Nunca** uses *Terminate* (destruye todo) |
| **Encender** | **Instance state → Start**. En ~2 minutos todo vuelve solo (`restart: unless-stopped`), con la misma IP y los mismos datos |
| **Actualizar** a la última versión de `main` | Session Manager → `sudo -iu ec2-user` → `cd /opt/comanda && ./deploy/desplegar.sh latest`. Con el paso 21, se hace solo |
| Volver a una versión anterior | `./deploy/desplegar.sh <commit>` (los primeros 12 caracteres del commit). Ver `docs/runbook.md` |
| **Cambiar una variable** | CloudShell: `aws ssm put-parameter --name /comanda/beta/<VAR> --type SecureString --value "..." --overwrite` y luego volver a desplegar |
| **Ver logs** en vivo | `$C logs -f --tail=100 backend-1`, o CloudWatch → Log groups → `/comanda/beta` |
| **Ver qué está corriendo** | `$C ps` y `docker stats --no-stream` |
| **Reiniciar la demo** con datos limpios | `$C run --rm migrate npx prisma db seed` (borra todo) |
| Revisar **costos** | Billing → **Bills** (por servicio) y **Credits** (saldo) |

En todos los casos, `$C` es:

```bash
C="docker compose -f docker-compose.prod.yml -f docker-compose.prod.aws.yml --env-file .env.prod"
```

---

## 28. Al terminar el proyecto: destruir todo

Hazlo en este orden apenas termine la sustentación, para no seguir gastando
créditos ni pasar al plan pago sin querer.

1. **Guarda evidencia**: capturas, resultado de la prueba de carga y el costo
   consumido (Billing → Bills).
2. (Opcional) Descarga el último respaldo: S3 → `comanda-respaldos-<SUFIJO>`
   → `postgres/` → el `.dump` más reciente → **Download**.
3. En GitHub, si hiciste el paso 21: variable `DESPLIEGUE_HABILITADO` =
   `false`.
4. **EC2 → Instances → `comanda-beta` → Instance state → Terminate**. El disco
   se borra con ella.
5. **EC2 → Elastic IPs →** selecciona la IP → **Actions → Release Elastic IP
   addresses**. Si no la liberas, sigue cobrando.
6. **EC2 → Security Groups:** borra `comanda-beta-web`.
7. **CloudWatch:**
   - **Alarms**: selecciona todas las `comanda-beta-*` → **Delete**;
   - **Log groups**: borra `/comanda/beta`;
   - cambia la región a `us-east-1` si no lo estaba y borra también la alarma
     `comanda-beta-sin-servicio`.
8. **Route 53 → Health checks:** borra el chequeo de Comanda. Es lo único que
   cobra mensual aunque no haya servidor.
9. **SNS → Topics:** borra `comanda-beta-alertas`.
10. **S3:** para cada bucket, **Empty** y luego **Delete**.
11. **Systems Manager → Parameter Store:** selecciona los `/comanda/beta/*` →
    **Delete**. También se puede desde CloudShell:

    ```bash
    aws ssm get-parameters-by-path --path /comanda/beta/ --query 'Parameters[].Name' --output text \
      | tr '\t' '\n' | xargs -n 10 aws ssm delete-parameters --names
    ```
12. **SES:** borra las identidades y, en **IAM → Users**, el usuario de SMTP
    (`ses-smtp-user...`).
13. **IAM:** borra los roles `comanda-beta-ec2` y `comanda-github-despliegue`,
    la política `comanda-beta-ec2-politica` y el proveedor OIDC de GitHub.
14. **DuckDNS:** borra el subdominio.
15. Al día siguiente, revisa **Billing → Bills**: el consumo diario debe ser
    cero.
16. Si ya no vas a usar la cuenta, puedes cerrarla (menú de la cuenta →
    **Account → Close account**) o dejar que el plan gratuito venza. Al vencer,
    AWS borra todo a los 90 días.

---

## 29. Anexo A. Todas las variables de `.env.prod`

| Variable | Qué poner | Ejemplo |
|---|---|---|
| `DOMINIO` | Tu dominio, sin `https://` | `comanda-dk26.duckdns.org` |
| `CORS_ORIGENES` | Orígenes permitidos, con `https://` y separados por coma | `https://comanda-dk26.duckdns.org,https://demo.comanda-dk26.duckdns.org` |
| `URL_PUBLICA_CADENA` | Plantilla del subdominio por cadena; vacío = sin subdominios | `https://{subdominio}.comanda-dk26.duckdns.org` |
| `DOMINIOS_EXTRA` | Nombres extra para el certificado, separados por coma | `demo.comanda-dk26.duckdns.org` |
| `CORREO_LETSENCRYPT` | Correo para avisos de Let's Encrypt (opcional) | `equipo.comanda@gmail.com` |
| `SWAGGER_HABILITADO` | `false` en la nube | `false` |
| `LOG_FORMATO` | `json` (para CloudWatch) | `json` |
| `NODE_ENV` | `production` | `production` |
| `REGISTRO` | Registro de imágenes (no cambiar) | `ghcr.io/blowyxx72` |
| `TAG` | Versión de las imágenes (no cambiar; `desplegar.sh` la ajusta) | `latest` |
| `POSTGRES_USER` / `POSTGRES_DB` | No cambiar | `comanda` |
| `POSTGRES_PASSWORD` | `<clave1>` (hex) | |
| `DATABASE_URL` | Con `<clave1>` | `postgresql://comanda:<clave1>@postgres:5432/comanda?schema=public` |
| `DATABASE_URL_APP` | Con `<clave2>` | `postgresql://comanda_app:<clave2>@postgres:5432/comanda?schema=public` |
| `POSTGRES_REPLICATION_USER` | No cambiar | `replicador` |
| `POSTGRES_REPLICATION_PASSWORD` | `<clave3>` | |
| `DATABASE_URL_REPLICA` | Con `<clave2>` y host `postgres-replica` | `postgresql://comanda_app:<clave2>@postgres-replica:5432/comanda?schema=public` |
| `AMBIENTE` | `beta` (permite el seed de demo) | `beta` |
| `RESPALDO_S3_BUCKET` | Bucket de respaldos | `comanda-respaldos-dk26` |
| `RESPALDO_S3_PREFIJO` | No cambiar | `postgres` |
| `RESPALDO_CRON` | Hora del respaldo, en UTC | `"0 8 * * *"` |
| `RESPALDO_RETENCION_DIAS` | No cambiar | `30` |
| `DOCUMENTOS_PREFIJO_FISCAL` | No cambiar | `fiscal/` |
| `JWT_SECRET` | `<clave4>` | |
| `JWT_EXPIRES_IN` | Duración de la sesión | `8h` |
| `COLA_*_INTENTOS`, `DIAN_SIMULADA_*` | No cambiar (simulador DIAN) | `5`, `2000`, `0.2`, `0.1` |
| `RESUMEN_DIARIO_CRON` / `RESUMEN_DIARIO_ZONA` | No cambiar | `"0 23 * * *"` / `America/Bogota` |
| `PLATAFORMA_SIMULADA_API_KEY` | `<clave5>` | |
| `PLATAFORMA_SIMULADA_URL_ACUSES_BASE` | No cambiar | `http://backend:3000` |
| `AWS_REGION` / `S3_REGION` | `us-east-1` | `us-east-1` |
| `S3_BUCKET` | Bucket de documentos | `comanda-documentos-dk26` |
| `S3_BUCKET_IMAGENES` | Bucket de imágenes | `comanda-imagenes-dk26` |
| `S3_FORCE_PATH_STYLE` | `false` en AWS | `false` |
| `URL_PUBLICA_IMAGENES` | Vacío (las sirve el backend) o la URL de CloudFront | (vacío) |
| `SMTP_HOST` | Endpoint SMTP de SES | `email-smtp.us-east-1.amazonaws.com` |
| `SMTP_PORT` / `SMTP_SECURE` | `587` / `false` (STARTTLS) | |
| `SMTP_USER` / `SMTP_PASS` | Credenciales SMTP de SES (paso 8) | |
| `SMTP_FROM` | Remitente **verificado** en SES, entre comillas | `"Comanda Central <equipo.comanda@gmail.com>"` |

---

## 30. Anexo B. Solución de problemas

**1. Session Manager dice que no se puede conectar.**

- Espera 5 minutos después de lanzar la instancia.
- Revisa que el rol `comanda-beta-ec2` tenga `AmazonSSMManagedInstanceCore`
  (paso 7.2) y que la instancia tenga ese rol: **Instances → Actions →
  Security → Modify IAM role**.
- Si cambiaste el rol, reinicia la instancia.
- Debe tener IP pública: la Elastic IP o la automática.

**2. `cloud-init-output.log` muestra un error y no existe `/opt/comanda`.**

Casi siempre es falta de internet al arrancar (*Auto-assign public IP*
deshabilitado) o un error al pegar el *user data*. Hay dos salidas:

- **La más simple:** terminar la instancia y lanzarla de nuevo.
- **Desde Session Manager:** correr el script otra vez.

  ```bash
  sudo -i
  curl -fsSL https://raw.githubusercontent.com/BlowyXx72/Comanda/main/deploy/ec2-user-data.sh | bash
  ```

**3. `desplegar.sh` falla con `failed to initialize logging driver` o
`ResourceNotFoundException`.**

Falta el grupo de logs `/comanda/beta` o está en otra región. Créalo (paso 11)
en `us-east-1` y vuelve a correr `./deploy/desplegar.sh latest`.

**4. *Access Denied* con S3 (al subir fotos, en el seed de imágenes o en los
XML).**

Revisa en este orden:

1. **Hop limit**: **Instances → Actions → Instance settings → Modify instance
   metadata options** → *Metadata response hop limit* = **2** → **Save**.
2. Que los nombres de bucket de la política (paso 7.1) coincidan con los de
   `.env.prod`.
3. Que la región sea `us-east-1`.

**5. `migrate` termina con error de contraseña (`password authentication
failed`).**

- La clave de `DATABASE_URL` no coincide con `POSTGRES_PASSWORD`, o la de
  `DATABASE_URL_APP` no coincide con la de `DATABASE_URL_REPLICA`.
- Corrige en SSM (sección 27) y vuelve a desplegar.
- Si la base ya se había creado con otra clave, la de Postgres no cambia sola.
  Lo más fácil, **solo si no hay datos que te importen**, es borrar los
  volúmenes y empezar de nuevo:

  ```bash
  cd /opt/comanda
  C="docker compose -f docker-compose.prod.yml -f docker-compose.prod.aws.yml --env-file .env.prod"
  $C down -v
  ./deploy/desplegar.sh latest
  ```

**6. `certificado.sh emitir` falla.**

- `Timeout during connect` o `Connection refused`: el puerto 80 no está
  abierto (paso 12) o Nginx no está arriba (`$C ps`).
- `NXDOMAIN` o `DNS problem`: el dominio no apunta a la Elastic IP. Revisa
  DuckDNS y el `nslookup` del paso 5.
- `too many certificates`: es el límite semanal de Let's Encrypt. Espera o
  usa otro subdominio de DuckDNS.

Mientras tanto la app funciona con el certificado provisional, con
advertencia.

**7. Los correos no llegan.**

- En sandbox, el destinatario **tiene que estar verificado** en SES.
- Revisa la carpeta de spam.
- Revisa el log del worker: `$C logs --tail=100 worker | grep -i correo`.
- Confirma `SMTP_USER` y `SMTP_PASS`: son las credenciales **SMTP**, no
  llaves de acceso.

**8. La página carga, pero el tiempo real no actualiza.**

- Revisa que `CORS_ORIGENES` tenga exactamente `https://<TU_DOMINIO>`, sin
  barra al final.
- En el navegador, F12 → **Console**, busca errores de WebSocket.

**9. Se queda sin memoria (`docker stats` muestra todo al límite, la alarma
de memoria suena).**

- `free -h` debe mostrar el swap de 2 GB.
- Para el día de la prueba de carga: detén la instancia, cámbiala a
  `c7i-flex.large` (**Actions → Instance settings → Change instance type**),
  enciéndela y, al terminar, regrésala a `t3.small`.

**10. AWS pide verificar la cuenta o la tarjeta, o suspende algo.**

Revisa el correo de la cuenta raíz y **Billing → Payments**. Con el plan
gratuito no se cobra a la tarjeta mientras haya créditos.

---

## 31. Anexo C. Dominio propio y certificado comodín (opcional)

Si quieren un dominio "de verdad" (`comandacentral.co`, `comanda-demo.click`,
etc.):

1. **Comprarlo.** Puede ser en **Route 53 → Registered domains → Register
   domain**, o en otro registrador (Namecheap, Porkbun...).
   - Cuesta entre USD 3 y 15 al año según la terminación.
   - La compra del dominio **puede no estar cubierta por los créditos** ni
     permitida en el plan gratuito. Revísalo antes de comprar.
2. **Zona en Route 53** (USD 0,50 al mes): **Route 53 → Hosted zones → Create
   hosted zone** con el dominio. Si lo compraste en otro lado, cambia allá los
   *nameservers* por los 4 de la zona.
3. **Registros `A`:** el dominio (`@`) y el comodín (`*`), los dos a la
   `<IP_ELASTICA>`.
4. **Permisos:** agrega a `comanda-beta-ec2-politica` las dos declaraciones
   `CertificadoComodin*` de `deploy/iam/ec2-rol-politica.json`, con el ID de
   la zona.
5. En SSM:
   - `DOMINIO` y `CORS_ORIGENES` con el dominio nuevo;
   - `URL_PUBLICA_CADENA=https://{subdominio}.<dominio>`;
   - `DOMINIOS_EXTRA` vacío.
6. Despliega y pide el **certificado comodín**:

   ```bash
   ./deploy/certificado.sh comodin
   ```

   Cubre `<dominio>` y `*.<dominio>`, así que sirve para todas las cadenas.
7. **Con dominio propio, SES puede verificar el dominio completo** (registros
   DKIM en Route 53) y los correos ya no caen en spam.

**CloudFront para las fotos** (§4.3 de la propuesta, opcional): ver
`docs/despliegue-aws.md`, sección 9.

---

## 32. Anexo D. Glosario

| Término | Qué es |
|---|---|
| **AWS** | Amazon Web Services, la nube de Amazon |
| **Región** | Grupo de centros de datos en una zona geográfica; aquí `us-east-1` (Virginia, EE. UU.) |
| **EC2** | Servidores virtuales. Una *instancia* es un servidor |
| **AMI** | La imagen del sistema operativo con que arranca la instancia (Amazon Linux 2023) |
| **EBS** | El disco de la instancia |
| **Elastic IP** | Una IP pública fija que se asocia a la instancia |
| **Security group** | El firewall de la instancia (qué puertos se abren) |
| **IAM** | Usuarios, roles y permisos de AWS |
| **Rol de IAM** | Permisos que usa un servicio (la EC2) sin contraseñas guardadas |
| **MFA** | Segundo factor de autenticación (código del celular) |
| **S3 / bucket** | Almacenamiento de archivos; un bucket es un "contenedor" de archivos |
| **SSM Parameter Store** | Almacén de configuración y secretos cifrados |
| **Session Manager** | Terminal del servidor desde el navegador, sin SSH |
| **CloudShell** | Terminal Linux gratis en la consola, con la CLI de AWS lista |
| **SES** | Servicio de envío de correo |
| **CloudWatch** | Logs, métricas y alarmas |
| **SNS** | Notificaciones (aquí, avisos de alarma por correo) |
| **Route 53** | DNS de AWS; aquí solo para el chequeo de salud (o el dominio propio) |
| **User data** | Script que la instancia ejecuta una sola vez al crearse |
| **IMDS / hop limit** | Servicio de metadatos de la instancia; con *hop limit* 2, los contenedores Docker también lo alcanzan |
| **GHCR** | GitHub Container Registry, donde están publicadas las imágenes Docker del proyecto |
| **OIDC** | Forma de que GitHub Actions entre a AWS sin llaves guardadas |
| **Let's Encrypt** | Autoridad que emite certificados HTTPS gratis por 90 días (renovables) |
| **DuckDNS** | Servicio gratuito de nombres de dominio (`nombre.duckdns.org`) |
| **Sandbox de SES** | Modo inicial de SES: solo envía entre correos verificados |

---

## 33. Anexo E. Lista de verificación final

**Cuenta y costos:**

- [ ] Cuenta creada con **plan gratuito**, MFA en el raíz y usuario
      administrador de IAM con MFA.
- [ ] Región `us-east-1` en todo.
- [ ] Presupuesto de USD 25 **sin créditos** y alertas del plan gratuito
      activas.

**Red, almacenamiento y permisos:**

- [ ] Elastic IP reservada y DuckDNS apuntando a ella (dominio y `demo.`).
- [ ] 3 buckets privados, con reglas de 5 años (`fiscal/`) y de 30 días
      (`postgres/`).
- [ ] Rol `comanda-beta-ec2` con sus 3 políticas.

**Configuración:**

- [ ] SES: remitente y destinatarios verificados, y credenciales SMTP.
- [ ] `.env.prod` completo; claves coherentes; cargado en SSM (~45
      parámetros); borrado de CloudShell.
- [ ] Grupo de logs `/comanda/beta` (7 días).
- [ ] Grupo de seguridad con solo 80 y 443.

**Servidor y aplicación:**

- [ ] EC2 `t3.small` x86 con el rol, *hop limit* 2 y el *user data*.
- [ ] Session Manager: comprobaciones del paso 14 correctas.
- [ ] `desplegar.sh latest`: todo *healthy*.
- [ ] Seed y fotos cargados.
- [ ] Certificado de Let's Encrypt con candado (dominio y `demo.`).
- [ ] Pruebas del navegador y `prueba-integracion.mjs` en `TODO OK`.

**Operación:**

- [ ] Respaldo manual en S3 y prueba de restauración.
- [ ] Alarmas creadas y suscripción SNS confirmada.
- [ ] (Opcional) Despliegue automático desde GitHub.
- [ ] Evidencias guardadas: capturas, URL pública y costo consumido.
