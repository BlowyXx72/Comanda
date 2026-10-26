import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { verificarSedeDelUsuario } from '../auth/sede-usuario.js';
import { TablesService } from '../tables/tables.service.js';
import { BranchesService } from './branches.service.js';

// Consumido por: mesero (elige sede/mesa) y caja (ve el estado de las mesas).
@ApiTags('sedes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sedes')
export class BranchesController {
  constructor(
    private readonly branchesService: BranchesService,
    private readonly tablesService: TablesService,
  ) {}

  // Fase 17: un usuario con sede asignada solo recibe la suya.
  @ApiOperation({ summary: 'Lista las sedes de la cadena del usuario autenticado (solo la suya si tiene sede asignada)' })
  @Get()
  async listar(@UsuarioActual() usuario: UsuarioAutenticado) {
    const sedes = await this.branchesService.listar(usuario.cadenaId);
    return usuario.sedeId ? sedes.filter((sede) => sede.id === usuario.sedeId) : sedes;
  }

  @ApiOperation({ summary: 'Lista las mesas de una sede (debe pertenecer a la cadena del usuario)' })
  @Get(':id/mesas')
  async listarMesas(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    await this.branchesService.obtenerDeCadena(id, usuario.cadenaId);
    verificarSedeDelUsuario(usuario, id);
    return this.tablesService.listarPorSede(id, usuario.cadenaId);
  }
}
