import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// DECISIÓN DE PROTOTIPO: formato JSON propio de la "plataforma simulada", a
// propósito distinto del de Comanda (en inglés, con sus propios nombres de
// campo), para que se vea que IntegracionesService traduce un pedido ajeno
// sin re-digitarlo (CU-05). No copia el contrato de la API de Rappi: no hay
// acceso aprobado y CLAUDE.md prohíbe integrarla.

export class ClientePlataformaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  address!: string;
}

export class ItemPlataformaDto {
  // La plataforma conoce los productos por el id que le dio
  // GET /integraciones/plataformas/catalogo.
  @IsUUID()
  sku!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  comment?: string;
}

export class PedidoPlataformaDto {
  // Id del pedido en la plataforma. Es la llave de idempotencia: un reenvío
  // con el mismo orderId no crea otra comanda.
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  orderId!: string;

  // Sede de destino; tiene que ser de la cadena de la API key.
  @IsUUID()
  storeId!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => ClientePlataformaDto)
  customer!: ClientePlataformaDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemPlataformaDto)
  items!: ItemPlataformaDto[];
}
