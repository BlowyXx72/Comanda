# Fase 18 (§5.1, "respaldos diarios"): contenedor de respaldos de PostgreSQL.
# Misma versión de Postgres que la base (pg_dump/pg_restore 16) más aws-cli
# para subir y bajar los respaldos del almacén de objetos.
# DECISIÓN DE PROTOTIPO: aws-cli (paquete de Alpine) en vez de código Node:
# habla igual con MinIO (S3_ENDPOINT) que con Amazon S3 (rol de IAM de la
# EC2, sin llaves), y el contenedor no depende del backend.
FROM postgres:16-alpine

RUN apk add --no-cache aws-cli

COPY comun.sh respaldar.sh restaurar.sh ciclo-de-vida.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh

ENTRYPOINT ["entrypoint.sh"]
CMD ["programado"]
