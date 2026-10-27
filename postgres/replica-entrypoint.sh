#!/bin/sh
# DECISIÓN DE PROTOTIPO (Fase 13, §5.1): arranque de postgres-replica.
# Si el directorio de datos está vacío hace pg_basebackup desde el primario
# (-R deja standby.signal y primary_conninfo) y luego arranca postgres como
# réplica en streaming de solo lectura (hot_standby). Si ya tiene datos de un
# arranque anterior, solo arranca: la réplica retoma el streaming sola.
# Corre como root para poder dar el dueño correcto al directorio de datos y
# luego baja a `postgres` con su-exec.
set -e

PGDATA="${PGDATA:-/var/lib/postgresql/data}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[replica] directorio de datos vacío: pg_basebackup desde postgres..."
  mkdir -p "$PGDATA"
  rm -rf "${PGDATA:?}"/*
  export PGPASSWORD="$POSTGRES_REPLICATION_PASSWORD"
  # El primario puede estar aceptando conexiones pero sin el rol de
  # replicación todavía (lo crea el servicio postgres-replica-setup): reintentar.
  intentos=0
  until pg_basebackup -h postgres -p 5432 -U "$POSTGRES_REPLICATION_USER" \
      -D "$PGDATA" -X stream -R -P; do
    intentos=$((intentos + 1))
    if [ "$intentos" -ge 15 ]; then
      echo "[replica] pg_basebackup falló $intentos veces, abandono" >&2
      exit 1
    fi
    echo "[replica] pg_basebackup falló, reintento $intentos/15 en 3 s..."
    rm -rf "${PGDATA:?}"/*
    sleep 3
  done
  unset PGPASSWORD
fi

chown -R postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"
exec su-exec postgres postgres -c hot_standby=on
