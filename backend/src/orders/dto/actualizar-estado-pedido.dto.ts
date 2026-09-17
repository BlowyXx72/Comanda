import { IsIn } from 'class-validator';
import type { EstadoPedido } from '../../generated/prisma/enums.js';

// PAGADO queda fuera a propósito: ese estado solo lo asigna PaymentsModule
// (Fase 5) como parte de registrar el pago, no un PATCH suelto.
const ESTADOS_PERMITIDOS_POR_PATCH = ['ABIERTO', 'EN_PREPARACION', 'LISTO'] as const;

export class ActualizarEstadoPedidoDto {
  @IsIn(ESTADOS_PERMITIDOS_POR_PATCH)
  estado!: Extract<EstadoPedido, (typeof ESTADOS_PERMITIDOS_POR_PATCH)[number]>;
}
