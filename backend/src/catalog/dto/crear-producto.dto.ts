import { IsNumber, IsString, Min, MinLength } from 'class-validator';
import { Recortar } from './recortar.js';

export class CrearProductoDto {
  @Recortar()
  @IsString()
  @MinLength(1)
  nombre!: string;

  @IsNumber()
  @Min(0)
  precio!: number;

  @Recortar()
  @IsString()
  @MinLength(1)
  categoria!: string;
}
