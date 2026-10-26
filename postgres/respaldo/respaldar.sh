#!/bin/sh
# Fase 18: un respaldo completo de la base (pg_dump, formato custom,
# comprimido) subido a s3://$RESPALDO_S3_BUCKET/$RESPALDO_S3_PREFIJO/.
# Lo corre el cron del contenedor (entrypoint.sh) o a mano:
#   docker compose run --rm respaldo respaldar
. /usr/local/bin/comun.sh

marca="$(date -u +%Y%m%dT%H%M%SZ)"
archivo="/tmp/${PGDATABASE}-${marca}.dump"
llave="${RESPALDO_S3_PREFIJO}/${PGDATABASE}-${marca}.dump"

log "pg_dump de ${PGDATABASE} en ${PGHOST}"
# --enable-row-security: las tablas tienen FORCE ROW LEVEL SECURITY (Fase 12).
# En Docker el dueño es superusuario y la ignora, pero en RDS el usuario
# maestro no lo es: sin esta opción pg_dump falla en vez de leer por la
# política dueno_total.
pg_dump --format=custom --enable-row-security --file="$archivo"

# El bucket se crea si no existe (local). En AWS ya existe y el rol solo
# necesita s3:PutObject sobre el prefijo; head-bucket no hace falta que pase.
s3 s3api head-bucket --bucket "$RESPALDO_S3_BUCKET" >/dev/null 2>&1 \
  || s3 s3 mb "s3://${RESPALDO_S3_BUCKET}" >/dev/null 2>&1 \
  || true

s3 s3 cp --only-show-errors "$archivo" "s3://${RESPALDO_S3_BUCKET}/${llave}"
log "OK s3://${RESPALDO_S3_BUCKET}/${llave} ($(du -h "$archivo" | cut -f1))"
rm -f "$archivo"
