import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { CrearMovimientoDto } from './dto/crear-movimiento.dto.js';
import { InventoryService } from './inventory.service.js';

// Consumido por: /inventario (ADMIN) — existencias por sede y movimientos
// manuales (ENTRADA/MERMA). Rutas sin prefijo de clase para calzar
// exactamente con docs/fases-siguientes-2.md Fase 11 (GET /sedes/:id/inventario,
// POST /inventario/movimientos).
@ApiTags('inventario')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @ApiOperation({ summary: 'Existencias de cada insumo en una sede (solo ADMIN)' })
  @Get('sedes/:sedeId/inventario')
  existencias(@Param('sedeId') sedeId: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.inventoryService.existenciasPorSede(sedeId, usuario.cadenaId);
  }

  @ApiOperation({ summary: 'Registra un movimiento manual de inventario (ENTRADA/MERMA, solo ADMIN)' })
  @Post('inventario/movimientos')
  registrarMovimiento(@Body() dto: CrearMovimientoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.inventoryService.registrarMovimiento(dto, usuario.cadenaId);
  }
}
