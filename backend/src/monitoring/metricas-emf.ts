// Fase 21B: métricas en "Embedded Metric Format" (EMF) de CloudWatch. Es una
// línea JSON por stdout con un bloque `_aws` que dice qué campos son
// métricas; cuando el log llega a CloudWatch Logs (driver awslogs, ver
// docker-compose.prod.aws.yml), CloudWatch crea la métrica sola.
// DECISIÓN DE PROTOTIPO: EMF en vez del SDK de CloudWatch: sin librería nueva,
// sin llamadas a la API ni permisos extra, y en local es solo un log más.
// Formato: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html

export const ESPACIO_METRICAS = 'Comanda';

export type UnidadMetrica = 'Count' | 'Seconds' | 'Milliseconds' | 'Percent';

export function lineaEmf(
  dimensiones: Record<string, string>,
  metricas: Record<string, { valor: number; unidad: UnidadMetrica }>,
  ahora = Date.now(),
): string {
  return JSON.stringify({
    _aws: {
      Timestamp: ahora,
      CloudWatchMetrics: [
        {
          Namespace: ESPACIO_METRICAS,
          Dimensions: [Object.keys(dimensiones)],
          Metrics: Object.entries(metricas).map(([nombre, { unidad }]) => ({ Name: nombre, Unit: unidad })),
        },
      ],
    },
    ...dimensiones,
    ...Object.fromEntries(Object.entries(metricas).map(([nombre, { valor }]) => [nombre, valor])),
  });
}
