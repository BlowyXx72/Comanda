#!/bin/sh
# Fase 13B. Corre dentro del contenedor `nginx` al arrancar (lo copia el
# Dockerfile a /docker-entrypoint.d/). Genera un certificado autofirmado para
# localhost y, si se define NGINX_CERT_IP en el .env, para la IP de la máquina
# en la red local (así un teléfono puede abrir https://<ip>:8443).
# El certificado vive en el volumen comanda-nginx-certs, nunca en el repo. Se
# regenera solo si cambian los nombres que debe cubrir.
# DECISIÓN DE PROTOTIPO: autofirmado; TODO PRODUCCIÓN: CA real.
set -eu

DIR=/etc/nginx/certs
# Fase 20B: *.localhost para probar el subdominio por cadena (demo.localhost).
SAN="DNS:localhost,DNS:*.localhost,IP:127.0.0.1"
if [ -n "${NGINX_CERT_IP:-}" ]; then
  SAN="$SAN,IP:$NGINX_CERT_IP"
fi

if [ -f "$DIR/comanda.crt" ] && [ -f "$DIR/comanda.key" ] && [ "$(cat "$DIR/san.txt" 2>/dev/null)" = "$SAN" ]; then
  echo "generar-certificado: certificado vigente para $SAN"
  exit 0
fi

mkdir -p "$DIR"
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -subj "/CN=localhost/O=Comanda Central (prototipo)" \
  -addext "subjectAltName=$SAN" \
  -keyout "$DIR/comanda.key" -out "$DIR/comanda.crt" 2>/dev/null
echo "$SAN" > "$DIR/san.txt"
echo "generar-certificado: certificado autofirmado creado para $SAN"
