#!/bin/sh
# Fase 18: configuración común de los scripts de respaldo. Todo sale de
# variables de entorno (ver .env.example, sección "Respaldos").
set -eu

: "${PGHOST:?Falta PGHOST}"
: "${PGUSER:?Falta PGUSER}"
: "${PGDATABASE:?Falta PGDATABASE}"
: "${RESPALDO_S3_BUCKET:?Falta RESPALDO_S3_BUCKET}"
RESPALDO_S3_PREFIJO="${RESPALDO_S3_PREFIJO:-postgres}"

# Sin llaves (AWS, rol de IAM de la EC2) aws-cli usa las credenciales de la
# instancia; una variable vacía haría que las ignore, así que se quitan.
[ -n "${AWS_ACCESS_KEY_ID:-}" ] || unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
export AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}"

# Local: MinIO (S3_ENDPOINT=http://minio:9000). AWS: vacío, S3 de verdad.
s3() {
  if [ -n "${S3_ENDPOINT:-}" ]; then
    aws --endpoint-url "$S3_ENDPOINT" "$@"
  else
    aws "$@"
  fi
}

log() {
  echo "[respaldo $(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}
