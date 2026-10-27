#!/bin/sh
# Fase 19B: certificado TLS real de Let's Encrypt para la beta (§5.2).
#   deploy/certificado.sh emitir    primera vez (el DNS de $DOMINIO ya debe
#                                   apuntar a la EC2 y el puerto 80 estar abierto)
#   deploy/certificado.sh comodin   Fase 20B: DOMINIO y *.DOMINIO (subdominio por
#                                   cadena), validando por DNS en Route 53
#   deploy/certificado.sh renovar   lo corre cron dos veces al día
# Usa certbot en un contenedor con el método webroot: Nginx (que ya está
# corriendo con el certificado provisional) sirve el reto HTTP-01 desde el
# volumen certbot-www, y certbot deja el certificado en el volumen
# letsencrypt, que Nginx monta (ver docker-compose.prod.yml y
# nginx/certificado-prod.sh). Luego se reinicia Nginx para tomarlo.
set -eu

ACCION="${1:-renovar}"
cd "$(dirname "$0")/.."
# Solo se leen estas dos variables (no se carga .env.prod con `.`: los $$
# escapados para Compose el shell los tomaría como el PID).
leer() { grep "^$1=" .env.prod | tail -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }
DOMINIO=$(leer DOMINIO)
CORREO_LETSENCRYPT=$(leer CORREO_LETSENCRYPT)
: "${DOMINIO:?Falta DOMINIO en .env.prod}"

PROYECTO=$(basename "$(pwd)")
# La imagen con el plugin de Route 53 sirve para todo (incluye webroot). Va en
# la red del host para llegar al servicio de metadatos de la EC2, de donde el
# plugin saca las credenciales del rol de IAM (sin llaves).
CERTBOT="docker run --rm --network host -v ${PROYECTO}_letsencrypt:/etc/letsencrypt -v ${PROYECTO}_certbot-www:/var/www/certbot certbot/dns-route53:v3.1.0"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

case "$ACCION" in
  emitir)
    if [ -n "$CORREO_LETSENCRYPT" ]; then
      CONTACTO="--email $CORREO_LETSENCRYPT"
    else
      CONTACTO="--register-unsafely-without-email"
    fi
    # shellcheck disable=SC2086
    $CERTBOT certonly --webroot -w /var/www/certbot -d "$DOMINIO" \
      $CONTACTO --agree-tos --non-interactive
    ;;
  comodin)
    # Let's Encrypt solo emite comodines validando por DNS: certbot crea el
    # registro TXT en la zona de Route 53 (permisos en
    # deploy/iam/ec2-rol-politica.json) y lo borra al terminar.
    if [ -n "$CORREO_LETSENCRYPT" ]; then
      CONTACTO="--email $CORREO_LETSENCRYPT"
    else
      CONTACTO="--register-unsafely-without-email"
    fi
    # shellcheck disable=SC2086
    $CERTBOT certonly --dns-route53 -d "$DOMINIO" -d "*.$DOMINIO"       $CONTACTO --agree-tos --non-interactive --expand
    ;;
  renovar)
    $CERTBOT renew --webroot -w /var/www/certbot --quiet
    ;;
  *)
    echo "Uso: $0 emitir|comodin|renovar" >&2
    exit 2
    ;;
esac

# certificado-prod.sh (al arrancar Nginx) apunta los enlaces al certificado
# real si existe; reiniciar es más simple que recargar y toma ~1 s.
$COMPOSE restart nginx
echo "certificado: listo para $DOMINIO"
