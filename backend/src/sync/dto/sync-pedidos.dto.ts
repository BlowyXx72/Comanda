import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreatePedidoDto } from '../../orders/dto/create-pedido.dto.js';

export class SyncPedidosDto {
  // DECISIÓN DE PROTOTIPO: tope de 50 pedidos por lote; el frontend parte la
  // cola si tiene más. Evita una petición gigante tras una caída larga.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreatePedidoDto)
  pedidos!: CreatePedidoDto[];
}
