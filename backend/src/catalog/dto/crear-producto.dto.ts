import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class CrearProductoDto {
  @IsString()
  @MinLength(1)
  nombre!: string;

  @IsNumber()
  @Min(0)
  precio!: number;

  @IsString()
  @MinLength(1)
  categoria!: string;
}
