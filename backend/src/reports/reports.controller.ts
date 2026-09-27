import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { ReporteConsolidadoQueryDto } from './dto/reporte-consolidado-query.dto.js';
import { ReporteVentasQueryDto } from './dto/reporte-ventas-query.dto.js';
import { ReportsService } from './reports.service.js';

// Consumido por: administración/caja (ventas por sede) y el panel
// consolidado del dueño en /panel (consolidado, Fase 9, CU-06).
@ApiTags('reportes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CAJERO', 'ADMIN')
@Controller('reportes')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @ApiOperation({ summary: 'Total y cantidad de ventas del día para una sede (por defecto, hoy)' })
  @Get('ventas')
  ventasDelDia(@Query() query: ReporteVentasQueryDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.reportsService.ventasDelDia(query.sedeId, usuario.cadenaId, query.fecha);
  }

  @ApiOperation({
    summary: 'Consolidado de ventas de todas las sedes de la cadena, agrupado por sede/día/canal (solo ADMIN)',
  })
  @Roles('ADMIN')
  @Get('consolidado')
  consolidado(@Query() query: ReporteConsolidadoQueryDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.reportsService.consolidado(usuario.cadenaId, query.desde, query.hasta);
  }
}
