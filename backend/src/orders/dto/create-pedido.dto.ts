import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { CreatePedidoDetalleDto } from './create-pedido-detalle.dto.js';

export class CreatePedidoDto {
  // DECISIÓN DE PROTOTIPO: el UUID lo genera el cliente (ver CLAUDE.md);
  // el backend lo usa para deduplicar reintentos en vez de generarlo él mismo.
  @IsUUID()
  id!: string;

  @IsUUID()
  sedeId!: string;

  @IsOptional()
  @IsUUID()
  mesaId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePedidoDetalleDto)
  detalles!: CreatePedidoDetalleDto[];
}
