import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { CreatePedidoDto } from '../../orders/dto/create-pedido.dto.js';
import { PagoOfflineDto } from '../../payments/dto/pago-offline.dto.js';

export class SyncPedidosDto {
  // DECISIÓN DE PROTOTIPO: tope de 50 pedidos por lote; el frontend parte la
  // cola si tiene más. Evita una petición gigante tras una caída larga.
  // Desde la Fase 16 es opcional (la caja manda solo `pagos`); SyncService
  // exige que venga al menos un elemento entre los dos arreglos.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreatePedidoDto)
  pedidos?: CreatePedidoDto[];

  // Fase 16 (§6.3, CU-07): cobros hechos sin conexión, con el consecutivo
  // que la caja tomó de su sub-rango reservado. Mismo tope que los pedidos.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PagoOfflineDto)
  pagos?: PagoOfflineDto[];
}
