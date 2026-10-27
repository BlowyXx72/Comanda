#!/bin/sh
# Fase 17B. Corre al arrancar el Nginx de producción (docker-entrypoint.d).
# La configuración siempre lee /etc/nginx/certs/actual/{fullchain,privkey}.pem;
# este script los apunta a:
#  - el certificado de Let's Encrypt de ${DOMINIO}, si ya existe (lo emite y
#    renueva certbot en la Fase 19B, en el volumen /etc/letsencrypt), o
#  - uno autofirmado para ${DOMINIO}, para que Nginx arranque igual la
#    primera vez (antes de emitir el real) o al probar en un PC.
set -eu

DOMINIO="${DOMINIO:-localhost}"
REAL="/etc/letsencrypt/live/$DOMINIO"
PROVISIONAL=/etc/nginx/certs/provisional
ACTUAL=/etc/nginx/certs/actual

mkdir -p "$ACTUAL" "$PROVISIONAL"

if [ -f "$REAL/fullchain.pem" ] && [ -f "$REAL/privkey.pem" ]; then
  ln -sf "$REAL/fullchain.pem" "$ACTUAL/fullchain.pem"
  ln -sf "$REAL/privkey.pem" "$ACTUAL/privkey.pem"
  echo "certificado-prod: usando Let's Encrypt para $DOMINIO"
  exit 0
fi

if [ ! -f "$PROVISIONAL/fullchain.pem" ] || [ "$(cat "$PROVISIONAL/dominio.txt" 2>/dev/null)" != "$DOMINIO" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
    -subj "/CN=$DOMINIO/O=Comanda Central (provisional)" \
    -addext "subjectAltName=DNS:$DOMINIO,DNS:localhost,IP:127.0.0.1" \
    -keyout "$PROVISIONAL/privkey.pem" -out "$PROVISIONAL/fullchain.pem" 2>/dev/null
  echo "$DOMINIO" > "$PROVISIONAL/dominio.txt"
fi
ln -sf "$PROVISIONAL/fullchain.pem" "$ACTUAL/fullchain.pem"
ln -sf "$PROVISIONAL/privkey.pem" "$ACTUAL/privkey.pem"
echo "certificado-prod: sin certificado de Let's Encrypt para $DOMINIO; usando uno autofirmado provisional"
