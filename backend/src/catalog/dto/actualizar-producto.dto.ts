import { IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

// Todos los campos opcionales: PATCH /productos/:id edita solo lo que venga
// en el body. `activo` incluido acá (no solo en DELETE) para poder
// reactivar un producto que se había dado de baja.
export class ActualizarProductoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nombre?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precio?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  categoria?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
