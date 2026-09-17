import { IsUUID } from 'class-validator';

export class ListarPedidosQueryDto {
  @IsUUID()
  sedeId!: string;
}
