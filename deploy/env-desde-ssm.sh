#!/bin/sh
# Fase 19B: arma .env.prod a partir de AWS Systems Manager Parameter Store.
# Cada parámetro bajo el prefijo es una variable: /comanda/beta/JWT_SECRET ->
# JWT_SECRET=... Los secretos se guardan como SecureString (cifrados con KMS)
# y nunca viven en el repo ni en una imagen. La EC2 los lee con su rol de IAM
# (deploy/iam/ec2-rol-politica.json).
#   deploy/env-desde-ssm.sh [prefijo]     (por defecto $COMANDA_SSM_PREFIJO)
set -eu

PREFIJO="${1:-${COMANDA_SSM_PREFIJO:-/comanda/beta/}}"
cd "$(dirname "$0")/.."
TEMPORAL=$(mktemp)
trap 'rm -f "$TEMPORAL"' EXIT

# Una línea por parámetro: nombre<TAB>valor. --recursive no hace falta: todo
# va directo bajo el prefijo.
aws ssm get-parameters-by-path --path "$PREFIJO" --with-decryption \
  --query 'Parameters[*].[Name,Value]' --output text > "$TEMPORAL"

if [ ! -s "$TEMPORAL" ]; then
  echo "env-desde-ssm: no hay parámetros bajo $PREFIJO" >&2
  exit 1
fi

{
  echo "# Generado por deploy/env-desde-ssm.sh desde SSM ($PREFIJO). No editar a mano."
  # El valor va entre comillas dobles (como en .env.example); se escapan las
  # comillas y los $ para que Compose no los interprete.
  while IFS="$(printf '\t')" read -r nombre valor; do
    clave="${nombre#"$PREFIJO"}"
    valor=$(printf '%s' "$valor" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\$/$$/g')
    printf '%s="%s"\n' "$clave" "$valor"
  done < "$TEMPORAL"
} > .env.prod.nuevo

chmod 600 .env.prod.nuevo
mv .env.prod.nuevo .env.prod
echo "env-desde-ssm: .env.prod con $(grep -c '=' .env.prod) variables"
