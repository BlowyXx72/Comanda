#!/bin/sh
# Fase 18B: actualiza la beta en la EC2 a una versión publicada en GHCR.
# Lo llama el workflow de despliegue por AWS Systems Manager (sin SSH), o una
# persona a mano desde Session Manager:
#   /opt/comanda/deploy/desplegar.sh <tag>      (tag = commit, o latest)
# Supone el repo clonado en /opt/comanda (deploy/ec2-user-data.sh).
set -eu

TAG="${1:-latest}"
cd "$(dirname "$0")/.."

echo "== Desplegando Comanda $TAG =="

# Los archivos de compose y configuración del mismo commit que las imágenes.
git fetch --quiet origin
if [ "$TAG" != "latest" ]; then
  git checkout --quiet --detach "$TAG"
else
  git checkout --quiet main
  git pull --quiet --ff-only
fi

# Fase 19B: los secretos salen de SSM Parameter Store en cada despliegue
# (COMANDA_SSM_PREFIJO lo define ec2-user-data.sh). Sin él, se usa el
# .env.prod que ya haya en la carpeta.
if [ -n "${COMANDA_SSM_PREFIJO:-}" ]; then
  ./deploy/env-desde-ssm.sh "$COMANDA_SSM_PREFIJO"
fi

# TAG del entorno manda sobre el de .env.prod.
export TAG
ARCHIVOS="-f docker-compose.prod.yml"
# Fase 21B: en la EC2 los logs van a CloudWatch (COMANDA_CLOUDWATCH lo define
# ec2-user-data.sh).
if [ "${COMANDA_CLOUDWATCH:-}" = "true" ]; then
  ARCHIVOS="$ARCHIVOS -f docker-compose.prod.aws.yml"
fi
COMPOSE="docker compose $ARCHIVOS --env-file .env.prod"
$COMPOSE pull --quiet
# --wait: no termina hasta que todo queda healthy; si una versión nueva no
# arranca, el despliegue falla y el workflow queda en rojo.
$COMPOSE up -d --wait --remove-orphans

# Imágenes viejas fuera, para no llenar el disco de la instancia.
docker image prune -f >/dev/null

echo "== Comanda $TAG desplegada =="
$COMPOSE ps --format '{{.Service}}: {{.Status}}'
