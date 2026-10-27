import { IsDateString, IsIn, IsInt, IsNumber, IsUUID, Min } from 'class-validator';

const MEDIOS_PAGO = ['EFECTIVO', 'TARJETA'] as const;

// Fase 16 (§6.3, CU-07): un cobro que la caja registró sin conexión y llega
// en el arreglo `pagos` de POST /sync.
export class PagoOfflineDto {
  // UUID del pago generado en la caja: idempotencia del reintento, igual que
  // el UUID del Pedido.
  @IsUUID()
  id!: string;

  @IsUUID()
  pedidoId!: string;

  @IsIn(MEDIOS_PAGO)
  medio!: (typeof MEDIOS_PAGO)[number];

  @IsNumber()
  @Min(0.01)
  monto!: number;

  // Consecutivo que la caja tomó de su sub-rango reservado.
  @IsInt()
  @Min(1)
  consecutivo!: number;

  @IsUUID()
  dispositivoId!: string;

  // Momento real del cobro en la caja (no el de la sincronización), para que
  // la venta caiga en el día y la franja correctos de los reportes.
  @IsDateString()
  fechaHora!: string;
}
