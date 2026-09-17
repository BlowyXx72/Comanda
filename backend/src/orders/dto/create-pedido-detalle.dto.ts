import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreatePedidoDetalleDto {
  @IsUUID()
  productoId!: string;

  @IsInt()
  @Min(1)
  cantidad!: number;

  @IsOptional()
  @IsString()
  notas?: string;
}
