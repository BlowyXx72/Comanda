import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, ValidateNested } from 'class-validator';
import { ItemRecetaDto } from './item-receta.dto.js';

// PUT /productos/:productoId/receta reemplaza la receta completa del
// producto (CRUD mínimo: más simple que exponer POST/DELETE por insumo).
export class ActualizarRecetaDto {
  @IsArray()
  @ArrayUnique((item: ItemRecetaDto) => item.insumoId)
  @ValidateNested({ each: true })
  @Type(() => ItemRecetaDto)
  items!: ItemRecetaDto[];
}
