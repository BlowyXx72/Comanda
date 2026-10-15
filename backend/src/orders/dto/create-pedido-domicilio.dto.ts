import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
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

  // Fase 14B: opcional; si viene, el comprobante se envía por correo cuando
  // la DIAN simulada valida el documento.
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
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

  // Sin @IsDefined, ValidateNested deja pasar un cliente ausente y Prisma
  // termina respondiendo 500 en vez de 400.
  @IsDefined()
  @ValidateNested()
  @Type(() => ClienteDomicilioDto)
  cliente!: ClienteDomicilioDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePedidoDetalleDto)
  detalles!: CreatePedidoDetalleDto[];
}
