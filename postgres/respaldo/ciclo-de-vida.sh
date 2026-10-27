#!/bin/sh
# Fase 18 (§4.2): reglas de ciclo de vida del almacén de objetos.
#   docker compose run --rm respaldo ciclo-de-vida
# - Bucket de documentos (S3_BUCKET): los XML fiscales, bajo el prefijo
#   DOCUMENTOS_PREFIJO_FISCAL, se conservan 5 años y luego se borran solos.
# - Bucket de respaldos: cada respaldo se borra a los RESPALDO_RETENCION_DIAS.
# Se aplica una vez por bucket (al crear la infraestructura); repetirlo solo
# reemplaza las reglas.
# DECISIÓN DE PROTOTIPO: 1827 días = 5 años contando los bisiestos. La regla
# borra *después* de los 5 años; que nada se borre *antes* (p. ej. a mano) lo
# garantizaría S3 Object Lock, que hay que activar al crear el bucket
# (TODO PRODUCCIÓN, ver docs/datos-aws.md).
. /usr/local/bin/comun.sh

: "${S3_BUCKET:?Falta S3_BUCKET (bucket de los documentos)}"
DOCUMENTOS_PREFIJO_FISCAL="${DOCUMENTOS_PREFIJO_FISCAL:-fiscal/}"
RESPALDO_RETENCION_DIAS="${RESPALDO_RETENCION_DIAS:-30}"

aplicar() {
  bucket="$1"
  reglas="$2"
  s3 s3api head-bucket --bucket "$bucket" >/dev/null 2>&1 || s3 s3 mb "s3://${bucket}" >/dev/null
  s3 s3api put-bucket-lifecycle-configuration --bucket "$bucket" --lifecycle-configuration "$reglas"
  log "Ciclo de vida aplicado a ${bucket}:"
  s3 s3api get-bucket-lifecycle-configuration --bucket "$bucket"
}

aplicar "$S3_BUCKET" "{
  \"Rules\": [{
    \"ID\": \"xml-fiscal-5-anios\",
    \"Status\": \"Enabled\",
    \"Filter\": { \"Prefix\": \"${DOCUMENTOS_PREFIJO_FISCAL}\" },
    \"Expiration\": { \"Days\": 1827 }
  }]
}"

aplicar "$RESPALDO_S3_BUCKET" "{
  \"Rules\": [{
    \"ID\": \"respaldos-${RESPALDO_RETENCION_DIAS}-dias\",
    \"Status\": \"Enabled\",
    \"Filter\": { \"Prefix\": \"${RESPALDO_S3_PREFIJO}/\" },
    \"Expiration\": { \"Days\": ${RESPALDO_RETENCION_DIAS} }
  }]
}"
