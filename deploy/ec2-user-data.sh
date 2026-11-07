#!/bin/bash
# Fase 19B: "user data" de la EC2 de la beta (Amazon Linux 2023). AWS lo corre
# una sola vez, como root, al crear la instancia. Deja Docker, el repo en
# /opt/comanda y la hora sincronizada; el primer despliegue lo hace
# deploy/desplegar.sh (a mano o desde GitHub Actions). Ver docs/despliegue-aws.md.
#
# Antes de pegarlo en la consola, ajustar las dos variables de abajo.
set -euxo pipefail

REPO_URL="https://github.com/BlowyXx72/Comanda.git"
# Prefijo de los parámetros en SSM Parameter Store (deploy/env-desde-ssm.sh).
SSM_PREFIJO="/comanda/beta/"

# Docker, el plugin de Compose y git.
dnf install -y docker git
mkdir -p /usr/local/lib/docker/cli-plugins
ARQ=$(uname -m)
# La última versión publicada: una versión fija que ya no existiera cortaría
# todo este script (set -e) y la instancia quedaría a medio preparar.
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${ARQ}" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
systemctl enable --now docker
usermod -aG docker ec2-user

# §5.2 NTP: Amazon Linux trae chrony apuntando al Amazon Time Sync Service
# (169.254.169.123, dentro de la red de AWS). Solo se asegura que esté activo.
systemctl enable --now chronyd

# 2 GB de swap: la instancia pequeña (2 GB de RAM) corre dos backends, el
# worker, Postgres con réplica, Redis y Nginx.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# El repo (solo para los archivos de compose y los scripts; las imágenes
# vienen de GHCR).
git clone "$REPO_URL" /opt/comanda
chown -R ec2-user:ec2-user /opt/comanda
chmod +x /opt/comanda/deploy/*.sh

# deploy/desplegar.sh lee este prefijo para armar .env.prod desde SSM, y con
# COMANDA_CLOUDWATCH suma docker-compose.prod.aws.yml (logs a CloudWatch).
# AWS_DEFAULT_REGION: la región de la instancia (metadatos, IMDSv2), para que
# la CLI de aws (env-desde-ssm.sh) sepa dónde buscar los parámetros.
TOKEN_IMDS=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
REGION=$(curl -fsS -H "X-aws-ec2-metadata-token: ${TOKEN_IMDS}" http://169.254.169.254/latest/meta-data/placement/region)
cat > /etc/profile.d/comanda.sh <<PERFIL
export COMANDA_SSM_PREFIJO=${SSM_PREFIJO}
export COMANDA_CLOUDWATCH=true
export AWS_DEFAULT_REGION=${REGION}
PERFIL

# Fase 21B: agente de CloudWatch para memoria y disco (EC2 no los reporta
# solo; la CPU y los chequeos de estado sí).
dnf install -y amazon-cloudwatch-agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s   -c file:/opt/comanda/deploy/cloudwatch/agente.json

# Renovación del certificado de Let's Encrypt dos veces al día (certbot solo
# renueva si faltan menos de 30 días).
cat > /etc/cron.d/comanda-certificado <<'CRON'
17 3,15 * * * ec2-user /opt/comanda/deploy/certificado.sh renovar >> /var/log/comanda-certificado.log 2>&1
CRON
dnf install -y cronie
systemctl enable --now crond
