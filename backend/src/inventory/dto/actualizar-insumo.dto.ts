import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

// Todos los campos opcionales: PATCH /insumos/:id edita solo lo que venga en el body.
export class ActualizarInsumoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  unidad?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costoUnitario?: number;
}
