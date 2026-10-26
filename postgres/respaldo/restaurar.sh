#!/bin/sh
# Fase 18: restaura un respaldo de S3 en la base RESTAURAR_DB.
#   docker compose run --rm -e RESTAURAR_DB=comanda_prueba respaldo restaurar [llave]
# Sin llave usa el respaldo más reciente del prefijo. Por seguridad la base
# destino tiene que ser otra que PGDATABASE (la de la app), salvo que se pida
# explícitamente RESTAURAR_SOBRESCRIBIR=si (recuperación real, ver
# docs/datos-aws.md).
. /usr/local/bin/comun.sh

: "${RESTAURAR_DB:?Falta RESTAURAR_DB (base destino)}"
if [ "$RESTAURAR_DB" = "$PGDATABASE" ] && [ "${RESTAURAR_SOBRESCRIBIR:-no}" != "si" ]; then
  log "RESTAURAR_DB es la base de la app (${PGDATABASE}); para sobrescribirla usar RESTAURAR_SOBRESCRIBIR=si"
  exit 1
fi

llave="${1:-}"
if [ -z "$llave" ]; then
  # Las llaves llevan la fecha UTC en el nombre: el orden alfabético es el cronológico.
  llave="$(s3 s3 ls "s3://${RESPALDO_S3_BUCKET}/${RESPALDO_S3_PREFIJO}/" | awk '{print $4}' | grep '\.dump$' | sort | tail -n 1)"
  [ -n "$llave" ] || { log "No hay respaldos en s3://${RESPALDO_S3_BUCKET}/${RESPALDO_S3_PREFIJO}/"; exit 1; }
  llave="${RESPALDO_S3_PREFIJO}/${llave}"
fi

archivo="/tmp/restaurar.dump"
log "Descargando s3://${RESPALDO_S3_BUCKET}/${llave}"
s3 s3 cp --only-show-errors "s3://${RESPALDO_S3_BUCKET}/${llave}" "$archivo"

if [ "$RESTAURAR_DB" != "$PGDATABASE" ]; then
  # Base nueva y vacía para la prueba de restauración.
  dropdb --if-exists "$RESTAURAR_DB"
  createdb "$RESTAURAR_DB"
fi

log "pg_restore en ${RESTAURAR_DB}"
# --clean --if-exists: si la base destino ya tiene el esquema, lo reemplaza.
# --enable-row-security: igual que en respaldar.sh (FORCE RLS en RDS).
pg_restore --dbname="$RESTAURAR_DB" --clean --if-exists --enable-row-security --exit-on-error "$archivo"
rm -f "$archivo"

# Resumen para comparar a ojo con la base original.
log "Filas restauradas:"
psql --dbname="$RESTAURAR_DB" --no-psqlrc --tuples-only --command "
  SELECT format('  %-26s %s', t, n) FROM (
    SELECT 'cadenas' t, count(*) n FROM cadenas UNION ALL
    SELECT 'sedes', count(*) FROM sedes UNION ALL
    SELECT 'usuarios', count(*) FROM usuarios UNION ALL
    SELECT 'productos', count(*) FROM productos UNION ALL
    SELECT 'pedidos', count(*) FROM pedidos UNION ALL
    SELECT 'pagos', count(*) FROM pagos UNION ALL
    SELECT 'documentos_fiscales', count(*) FROM documentos_fiscales UNION ALL
    SELECT 'movimientos_inventario', count(*) FROM movimientos_inventario UNION ALL
    SELECT '_prisma_migrations', count(*) FROM _prisma_migrations
  ) x;"
log "OK"
