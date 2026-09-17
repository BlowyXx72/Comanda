import { IsIn, IsNumber, IsUUID, Min } from 'class-validator';

const MEDIOS_PAGO = ['EFECTIVO', 'TARJETA'] as const;

export class CrearPagoDto {
  @IsUUID()
  pedidoId!: string;

  @IsIn(MEDIOS_PAGO)
  medio!: (typeof MEDIOS_PAGO)[number];

  @IsNumber()
  @Min(0.01)
  monto!: number;
}
