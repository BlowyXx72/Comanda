import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { ActualizarEstadoPedidoDto } from './dto/actualizar-estado-pedido.dto.js';
import { CreatePedidoDto } from './dto/create-pedido.dto.js';
import { OrdersService } from './orders.service.js';

@UseGuards(JwtAuthGuard)
@Controller('pedidos')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Consumido por: mesero, al presionar "Enviar comanda" en /mesas.
  @UseGuards(RolesGuard)
  @Roles('MESERO', 'ADMIN')
  @Post()
  crear(@Body() dto: CreatePedidoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.ordersService.crear(dto, usuario.userId, usuario.cadenaId);
  }

  // Consumido por: mesero/cocina/caja para ver el detalle de un pedido.
  @Get(':id')
  obtener(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.ordersService.obtener(id, usuario.cadenaId);
  }

  // Consumido por: cocina (marca LISTO). No se restringe por rol porque el
  // modelo de datos no define un rol "cocina" propio (ver docs/prototipo-slice.md).
  @Patch(':id/estado')
  actualizarEstado(
    @Param('id') id: string,
    @Body() dto: ActualizarEstadoPedidoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.ordersService.actualizarEstado(id, dto.estado, usuario.cadenaId);
  }
}
