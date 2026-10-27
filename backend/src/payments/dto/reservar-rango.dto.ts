import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

// Fase 16 (§6.3, CU-07): POST /pagos/rangos-offline.
export class ReservarRangoDto {
  @IsUUID()
  sedeId!: string;

  // UUID que genera el navegador de la caja (ver frontend/src/caja-offline/).
  @IsUUID()
  dispositivoId!: string;

  // DECISIÓN DE PROTOTIPO: bloques de 20 por defecto y 100 como máximo. Un
  // bloque que la caja no alcanza a usar deja esos números sin emitir (hueco
  // en la numeración de la sede); bloques chicos lo acotan.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  cantidad?: number;
}
