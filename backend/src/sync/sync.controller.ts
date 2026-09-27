import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { SyncPedidosDto } from './dto/sync-pedidos.dto.js';
import { SyncService } from './sync.service.js';

// Consumido por: /mesas al recuperar la conexión (frontend/src/offline/).
// TODO PRODUCCIÓN: cobro offline y consecutivos fiscales offline (dependen de
// los rangos de numeración por sede de la Fase 8); hoy solo se sincronizan
// pedidos.
@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @ApiOperation({ summary: 'Aplica un lote de pedidos creados sin conexión (idempotente por UUID); resultado por pedido' })
  @Roles('MESERO', 'ADMIN')
  @HttpCode(200)
  @Post()
  sincronizar(@Body() dto: SyncPedidosDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.syncService.aplicar(dto.pedidos, usuario.userId, usuario.cadenaId);
  }
}
