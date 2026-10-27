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
curl -fsSL "https://github.com/docker/compose/releases/download/v2.40.3/docker-compose-linux-${ARQ}" \
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

# deploy/desplegar.sh lee este prefijo para armar .env.prod desde SSM.
echo "export COMANDA_SSM_PREFIJO=${SSM_PREFIJO}" > /etc/profile.d/comanda.sh

# Renovación del certificado de Let's Encrypt dos veces al día (certbot solo
# renueva si faltan menos de 30 días).
cat > /etc/cron.d/comanda-certificado <<'CRON'
17 3,15 * * * ec2-user /opt/comanda/deploy/certificado.sh renovar >> /var/log/comanda-certificado.log 2>&1
CRON
dnf install -y cronie
systemctl enable --now crond
