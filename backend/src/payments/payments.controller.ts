import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { CrearPagoDto } from './dto/crear-pago.dto.js';
import { PaymentsService } from './payments.service.js';

// Consumido por: caja, al cobrar una mesa en /caja.
@ApiTags('pagos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CAJERO', 'ADMIN')
@Controller('pagos')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiOperation({
    summary: 'Cobra un pedido LISTO: registra el pago, genera el documento fiscal simulado y libera la mesa',
  })
  @Post()
  pagar(@Body() dto: CrearPagoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.paymentsService.pagar(dto, usuario.cadenaId);
  }
}
