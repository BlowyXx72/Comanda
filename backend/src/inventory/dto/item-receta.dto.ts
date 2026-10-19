import { IsNumber, IsUUID, Min } from 'class-validator';

export class ItemRecetaDto {
  @IsUUID()
  insumoId!: string;

  @IsNumber()
  @Min(0.01)
  cantidad!: number;
}
