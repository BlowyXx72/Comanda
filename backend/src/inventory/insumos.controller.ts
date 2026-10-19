import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { ActualizarInsumoDto } from './dto/actualizar-insumo.dto.js';
import { CrearInsumoDto } from './dto/crear-insumo.dto.js';
import { InventoryService } from './inventory.service.js';

// Consumido por: /inventario (ADMIN) — CRUD mínimo de insumos (Fase 11, §6.2).
@ApiTags('insumos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('insumos')
export class InsumosController {
  constructor(private readonly inventoryService: InventoryService) {}

  @ApiOperation({ summary: 'Lista los insumos de la cadena del usuario (solo ADMIN)' })
  @Get()
  listar(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.inventoryService.listarInsumos(usuario.cadenaId);
  }

  @ApiOperation({ summary: 'Crea un insumo en la cadena (solo ADMIN)' })
  @Post()
  crear(@Body() dto: CrearInsumoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.inventoryService.crearInsumo(usuario.cadenaId, dto);
  }

  @ApiOperation({ summary: 'Edita un insumo (solo ADMIN)' })
  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarInsumoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.inventoryService.actualizarInsumo(id, usuario.cadenaId, dto);
  }
}
