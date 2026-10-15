export const COLA_CORREO = 'correo';

// Trabajos de la cola de correo (§5.2, "SMTP: envío de comprobantes al
// comensal y resúmenes diarios al dueño"). Igual que las otras colas, todo
// trabajo de una cadena lleva su `cadenaId` (el worker no tiene JWT).
export type TrabajoCorreo =
  | { tipo: 'COMPROBANTE'; documentoFiscalId: string; cadenaId: string }
  // Sin `cadenaId`: el trabajo programado de las 23:00, que recorre todas las
  // cadenas. Con `cadenaId`: el disparo manual de un ADMIN para su cadena.
  // `fecha` (AAAA-MM-DD, día de Bogotá) es opcional; por defecto, hoy.
  | { tipo: 'RESUMEN_DIARIO'; cadenaId?: string; fecha?: string };
