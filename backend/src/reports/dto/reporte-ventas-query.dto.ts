import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ReporteVentasQueryDto {
  @IsUUID()
  sedeId!: string;

  // Formato YYYY-MM-DD. Si no se envía, se usa el día de hoy (UTC).
  @IsOptional()
  @IsDateString()
  fecha?: string;
}
