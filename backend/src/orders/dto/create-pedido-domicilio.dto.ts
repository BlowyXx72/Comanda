import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { CreatePedidoDetalleDto } from './create-pedido-detalle.dto.js';

export class ClienteDomicilioDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  telefono!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  direccion!: string;
}

export class CreatePedidoDomicilioDto {
  // Igual que en POST /pedidos: el UUID lo genera el navegador del cliente
  // para que un reintento no duplique el pedido.
  @IsUUID()
  id!: string;

  // Sin JWT no hay cadenaId implícito: viaja en el cuerpo (el mismo que va
  // en la URL del menú público) y se valida contra la sede.
  @IsUUID()
  cadenaId!: string;

  @IsUUID()
  sedeId!: string;

  @ValidateNested()
  @Type(() => ClienteDomicilioDto)
  cliente!: ClienteDomicilioDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePedidoDetalleDto)
  detalles!: CreatePedidoDetalleDto[];
}
