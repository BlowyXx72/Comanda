// Fase 17B: lo que cambia entre ambientes (local, beta en AWS) sale de
// variables de entorno, sin tocar código (contrato 2 de
// docs/fases-siguientes-3.md). Los valores por defecto son los de desarrollo
// local, para que `docker compose up` siga funcionando sin configurar nada.

const lista = (valor: string | undefined) =>
  (valor ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

// Orígenes que pueden llamar a la API y abrir el WebSocket.
// DECISIÓN DE PROTOTIPO: vacío = cualquiera, porque en local el frontend se
// abre por localhost:5173, :8443 o la IP de la red local. En la beta va el
// dominio real (p. ej. CORS_ORIGENES=https://comanda.ejemplo.co).
export function origenesCors(): string[] | true {
  const origenes = lista(process.env.CORS_ORIGENES);
  return origenes.length > 0 ? origenes : true;
}

// Swagger (/api/docs) expone el mapa completo de la API: útil en local,
// apagado en producción (SWAGGER_HABILITADO=false).
export const swaggerHabilitado = () => (process.env.SWAGGER_HABILITADO ?? 'true') !== 'false';

// LOG_FORMATO=json: una línea JSON por log (nivel, contexto, mensaje, hora),
// para que CloudWatch (Fase 21B) los filtre por campo. Por defecto, el
// formato de colores de Nest, más cómodo de leer en `docker compose logs`.
export const logsEnJson = () => process.env.LOG_FORMATO === 'json';

// Prefijo de los XML fiscales dentro del bucket de documentos (S3_BUCKET).
// La retención de 5 años (§4.2, Fase 18) es una regla de ciclo de vida por
// prefijo (postgres/respaldo/ciclo-de-vida.sh), así que el worker tiene que
// guardar los XML bajo el mismo DOCUMENTOS_PREFIJO_FISCAL. Siempre termina en
// "/" para que la llave quede `fiscal/{cadena}/...`; vacío = raíz del bucket.
export function prefijoDocumentosFiscales(): string {
  const valor = (process.env.DOCUMENTOS_PREFIJO_FISCAL ?? 'fiscal/').trim().replace(/^\/+/, '');
  return valor === '' || valor.endsWith('/') ? valor : `${valor}/`;
}
