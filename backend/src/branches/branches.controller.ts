import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
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

  @ApiOperation({ summary: 'Lista las sedes de la cadena del usuario autenticado' })
  @Get()
  listar(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.branchesService.listar(usuario.cadenaId);
  }

  @ApiOperation({ summary: 'Lista las mesas de una sede (debe pertenecer a la cadena del usuario)' })
  @Get(':id/mesas')
  async listarMesas(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    await this.branchesService.obtenerDeCadena(id, usuario.cadenaId);
    return this.tablesService.listarPorSede(id);
  }
}
