#!/bin/sh
# Fase 21B (§5.1 monitoreo): crea en CloudWatch el grupo de logs y las
# alarmas mínimas de la beta, con aviso por correo (SNS). Se corre una vez,
# desde AWS CloudShell (ya trae la CLI con los permisos de quien entra):
#
#   REGION=us-east-1 INSTANCIA=i-0123... CORREO=equipo@ejemplo.co \
#   DOMINIO=comanda.ejemplo.co sh deploy/cloudwatch/crear-alarmas.sh
#
# Es idempotente: volver a correrlo actualiza las alarmas. Las alarmas
# estándar entran en la capa gratuita (10); el chequeo de Route 53 cuesta
# ~USD 0,50 al mes. Ver docs/runbook.md para qué hacer cuando suena cada una.
set -eu

: "${REGION:?Falta REGION}"
: "${INSTANCIA:?Falta INSTANCIA (id de la EC2)}"
: "${CORREO:?Falta CORREO para los avisos}"
: "${DOMINIO:?Falta DOMINIO}"
GRUPO=/comanda/beta

aws() { command aws --region "$REGION" "$@"; }

echo "== Grupo de logs $GRUPO (retención 7 días) =="
aws logs create-log-group --log-group-name "$GRUPO" 2>/dev/null || true
aws logs put-retention-policy --log-group-name "$GRUPO" --retention-in-days 7

echo "== Tema SNS para los avisos =="
TEMA=$(aws sns create-topic --name comanda-beta-alertas --query TopicArn --output text)
aws sns subscribe --topic-arn "$TEMA" --protocol email --notification-endpoint "$CORREO" >/dev/null
echo "   Revisar $CORREO y confirmar la suscripción (llega un correo de AWS)."

# alarma <nombre> <descripción> <espacio> <métrica> <estadística> <umbral> <comparación> <periodos> <datos-faltantes> <dimensiones...>
alarma() {
  nombre=$1 descripcion=$2 espacio=$3 metrica=$4 estadistica=$5 umbral=$6 comparacion=$7 periodos=$8 faltantes=$9
  shift 9
  aws cloudwatch put-metric-alarm \
    --alarm-name "$nombre" --alarm-description "$descripcion" \
    --namespace "$espacio" --metric-name "$metrica" --dimensions "$@" \
    --statistic "$estadistica" --period 300 --evaluation-periods "$periodos" \
    --threshold "$umbral" --comparison-operator "$comparacion" \
    --treat-missing-data "$faltantes" \
    --alarm-actions "$TEMA" --ok-actions "$TEMA"
  echo "   $nombre"
}

echo "== Alarmas =="
alarma comanda-beta-instancia-caida "La EC2 falla sus chequeos de estado (runbook: instancia caída)" \
  AWS/EC2 StatusCheckFailed Maximum 1 GreaterThanOrEqualToThreshold 2 breaching \
  "Name=InstanceId,Value=$INSTANCIA"
alarma comanda-beta-cpu-alta "CPU de la EC2 sobre 80 % por 10 min" \
  AWS/EC2 CPUUtilization Average 80 GreaterThanThreshold 2 notBreaching \
  "Name=InstanceId,Value=$INSTANCIA"
alarma comanda-beta-disco-lleno "Disco raíz sobre 85 % (runbook: disco lleno)" \
  CWAgent disk_used_percent Maximum 85 GreaterThanThreshold 1 notBreaching \
  "Name=InstanceId,Value=$INSTANCIA"
alarma comanda-beta-memoria-alta "Memoria sobre 90 % por 10 min" \
  CWAgent mem_used_percent Average 90 GreaterThanThreshold 2 notBreaching \
  "Name=InstanceId,Value=$INSTANCIA"
# Sin datos también alarma: si el worker se cae, deja de publicar la métrica.
alarma comanda-beta-cola-fiscal-atascada "Documentos fiscales PENDIENTE hace más de 5 min, o el worker no reporta (runbook: cola atascada)" \
  Comanda DocumentosFiscalesAtascados Maximum 0 GreaterThanThreshold 2 breaching \
  "Name=Ambiente,Value=beta"

echo "== Disponibilidad de https://$DOMINIO/api/health (Route 53) =="
# Las métricas de los chequeos de Route 53 solo existen en us-east-1: la
# alarma (y su tema SNS) se crean ahí aunque la beta esté en otra región.
CHEQUEO=$(command aws route53 create-health-check \
  --caller-reference "comanda-beta-$DOMINIO" \
  --health-check-config "Type=HTTPS,FullyQualifiedDomainName=$DOMINIO,Port=443,ResourcePath=/api/health,RequestInterval=30,FailureThreshold=3" \
  --query HealthCheck.Id --output text 2>/dev/null \
  || command aws route53 list-health-checks \
       --query "HealthChecks[?CallerReference=='comanda-beta-$DOMINIO'].Id | [0]" --output text)
TEMA_USE1=$(command aws --region us-east-1 sns create-topic --name comanda-beta-alertas --query TopicArn --output text)
if [ "$REGION" != "us-east-1" ]; then
  command aws --region us-east-1 sns subscribe --topic-arn "$TEMA_USE1" --protocol email --notification-endpoint "$CORREO" >/dev/null
fi
command aws --region us-east-1 cloudwatch put-metric-alarm \
  --alarm-name comanda-beta-sin-servicio --alarm-description "https://$DOMINIO/api/health no responde (runbook: sin servicio)" \
  --namespace AWS/Route53 --metric-name HealthCheckStatus --dimensions "Name=HealthCheckId,Value=$CHEQUEO" \
  --statistic Minimum --period 60 --evaluation-periods 2 --threshold 1 --comparison-operator LessThanThreshold \
  --treat-missing-data breaching --alarm-actions "$TEMA_USE1" --ok-actions "$TEMA_USE1"
echo "   comanda-beta-sin-servicio (chequeo $CHEQUEO)"

echo "Listo. La alarma de presupuesto va aparte, en AWS Budgets (docs/despliegue-aws.md, paso 1)."
