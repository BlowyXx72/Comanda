#!/bin/sh
# Fase 18B: actualiza la beta en la EC2 a una versión publicada en GHCR.
# Lo llama el workflow de despliegue por AWS Systems Manager (sin SSH), o una
# persona a mano desde Session Manager:
#   /opt/comanda/deploy/desplegar.sh <tag>      (tag = commit, o latest)
# Supone el repo clonado en /opt/comanda y .env.prod ya armado (Fase 19B).
set -eu

TAG="${1:-latest}"
cd "$(dirname "$0")/.."

echo "== Desplegando Comanda $TAG =="

# Los archivos de compose y configuración del mismo commit que las imágenes.
if [ "$TAG" != "latest" ]; then
  git fetch --quiet origin
  git checkout --quiet --detach "$TAG"
else
  git pull --quiet --ff-only
fi

# TAG del entorno manda sobre el de .env.prod.
export TAG
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"
$COMPOSE pull --quiet
# --wait: no termina hasta que todo queda healthy; si una versión nueva no
# arranca, el despliegue falla y el workflow queda en rojo.
$COMPOSE up -d --wait --remove-orphans

# Imágenes viejas fuera, para no llenar el disco de la instancia.
docker image prune -f >/dev/null

echo "== Comanda $TAG desplegada =="
$COMPOSE ps --format '{{.Service}}: {{.Status}}'
