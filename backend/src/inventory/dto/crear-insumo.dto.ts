import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class CrearInsumoDto {
  @IsString()
  @MinLength(1)
  nombre!: string;

  @IsString()
  @MinLength(1)
  unidad!: string;

  @IsNumber()
  @Min(0)
  costoUnitario!: number;
}
