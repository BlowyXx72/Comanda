import { IsIn, IsNumber, IsUUID, Min } from 'class-validator';

// SALIDA no entra aquí: solo la crea PaymentsService.pagar (descuento
// automático por receta). Este endpoint es para ajustes manuales.
const TIPOS_MOVIMIENTO_MANUAL = ['ENTRADA', 'MERMA'] as const;

export class CrearMovimientoDto {
  @IsUUID()
  sedeId!: string;

  @IsUUID()
  insumoId!: string;

  @IsIn(TIPOS_MOVIMIENTO_MANUAL)
  tipo!: (typeof TIPOS_MOVIMIENTO_MANUAL)[number];

  @IsNumber()
  @Min(0.01)
  cantidad!: number;
}
