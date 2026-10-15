import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { ActualizarRecetaDto } from './dto/actualizar-receta.dto.js';
import { InventoryService } from './inventory.service.js';

// Consumido por: /inventario (ADMIN) — receta de un producto (Fase 11, §6.2).
@ApiTags('recetas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('productos/:productoId/receta')
export class RecetasController {
  constructor(private readonly inventoryService: InventoryService) {}

  @ApiOperation({ summary: 'Lista la receta de un producto (solo ADMIN)' })
  @Get()
  listar(@Param('productoId') productoId: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.inventoryService.listarReceta(productoId, usuario.cadenaId);
  }

  @ApiOperation({ summary: 'Reemplaza la receta completa de un producto (solo ADMIN)' })
  @Put()
  reemplazar(
    @Param('productoId') productoId: string,
    @Body() dto: ActualizarRecetaDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.inventoryService.reemplazarReceta(productoId, usuario.cadenaId, dto);
  }
}
