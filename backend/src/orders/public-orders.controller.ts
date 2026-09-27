import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreatePedidoDomicilioDto } from './dto/create-pedido-domicilio.dto.js';
import { OrdersService } from './orders.service.js';

// Consumido por: formulario de domicilio de la vista pública del menú (CU-04).
// Sin JwtAuthGuard a propósito: quien pide es un cliente externo, no un
// usuario interno de la cadena.
// TODO PRODUCCIÓN: rate limiting / captcha en este endpoint público para que
// no se pueda inundar la cocina de pedidos falsos.
@ApiTags('pedidos-publicos')
@Controller('public/pedidos')
export class PublicOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiOperation({ summary: 'Crea un pedido de domicilio desde la web (sin autenticación, idempotente por UUID)' })
  @Post('domicilio')
  async crearDomicilio(@Body() dto: CreatePedidoDomicilioDto) {
    const pedido = await this.ordersService.crearDomicilio(dto);
    // Al cliente externo solo se le confirma lo suyo, no el pedido completo
    // con la sede y los productos internos.
    return { id: pedido.id, estado: pedido.estado, total: pedido.total, fechaHora: pedido.fechaHora };
  }
}
