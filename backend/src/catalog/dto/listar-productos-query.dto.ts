import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListarProductosQueryDto {
  // Solo tiene efecto si quien pide el catálogo es ADMIN (ver
  // CatalogController): para el resto de roles, el catálogo siempre son
  // solo los productos activos.
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  incluirInactivos?: boolean;
}
