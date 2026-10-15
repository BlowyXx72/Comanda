# Fase 13B: Nginx 1.27.3+ porque `resolve` en los upstream (ver nginx.conf)
# llegó a la versión libre en la 1.27.3.
FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

# La imagen oficial ejecuta los .sh de /docker-entrypoint.d/ antes de
# arrancar Nginx. El sed quita \r por si git lo sacó con finales CRLF.
COPY generar-certificado.sh /docker-entrypoint.d/05-generar-certificado.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/05-generar-certificado.sh \
  && chmod +x /docker-entrypoint.d/05-generar-certificado.sh
