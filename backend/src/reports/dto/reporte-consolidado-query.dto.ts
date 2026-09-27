import { IsDateString, IsOptional } from 'class-validator';

export class ReporteConsolidadoQueryDto {
  // Formato YYYY-MM-DD. Si no se envía ninguno de los dos, el rango es "hoy".
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
