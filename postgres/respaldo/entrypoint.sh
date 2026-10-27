#!/bin/sh
# Fase 18: punto de entrada del contenedor de respaldos.
#   programado    (por defecto) cron que corre respaldar.sh según RESPALDO_CRON
#   respaldar     un respaldo ahora
#   restaurar     restaura en RESTAURAR_DB (ver restaurar.sh)
#   ciclo-de-vida aplica las reglas de retención de los buckets
set -eu

case "${1:-programado}" in
  respaldar) shift; exec respaldar.sh "$@" ;;
  restaurar) shift; exec restaurar.sh "$@" ;;
  ciclo-de-vida) shift; exec ciclo-de-vida.sh "$@" ;;
  programado)
    # El cron de BusyBox no le pasa el entorno a los trabajos: se guarda aquí
    # y cada corrida lo carga.
    export -p > /etc/respaldo.env
    # DECISIÓN DE PROTOTIPO: el reloj del contenedor está en UTC; el default
    # "0 8 * * *" son las 03:00 en Bogotá, fuera del horario de servicio.
    echo "${RESPALDO_CRON:-0 8 * * *} . /etc/respaldo.env && respaldar.sh > /proc/1/fd/1 2>&1" > /etc/crontabs/root
    echo "[respaldo] programado: ${RESPALDO_CRON:-0 8 * * *} (UTC)"
    exec crond -f -l 8
    ;;
  *) exec "$@" ;;
esac
