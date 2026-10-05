import type { EstadoDian } from '../generated/prisma/enums.js';

export const COLA_FISCAL = 'fiscal';

// Payload de cada trabajo. Lleva `cadenaId` porque el worker no tiene JWT:
// así puede validar el tenant (y, con la RLS de la Fase 12, fijar el contexto
// de la cadena antes de consultar).
export interface TrabajoFiscal {
  documentoFiscalId: string;
  cadenaId: string;
}

// Lo que devuelve el worker al terminar. BullMQ lo publica en el evento
// `completed`, y FiscalEventosService lo reenvía tal cual como
// `documento:actualizado` a la room de la sede.
export interface ResultadoFiscal {
  documentoFiscalId: string;
  pedidoId: string;
  sedeId: string;
  estadoDian: EstadoDian;
  urlXml: string | null;
  mensajeDian: string | null;
}
