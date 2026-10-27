import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { verificarSedeDelUsuario } from '../auth/sede-usuario.js';
import { ReporteConsolidadoQueryDto } from './dto/reporte-consolidado-query.dto.js';
import { ReporteRangoQueryDto } from './dto/reporte-rango-query.dto.js';
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
    verificarSedeDelUsuario(usuario, query.sedeId);
    return this.reportsService.ventasDelDia(query.sedeId, usuario.cadenaId, query.fecha);
  }

  @ApiOperation({
    summary: 'Consolidado de ventas de todas las sedes de la cadena, agrupado por sede/día (o mes, con agrupacion=mes)/canal (solo ADMIN)',
  })
  @Roles('ADMIN')
  @Get('consolidado')
  consolidado(@Query() query: ReporteConsolidadoQueryDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.reportsService.consolidado(usuario.cadenaId, query.desde, query.hasta, query.agrupacion);
  }

  @ApiOperation({ summary: 'Ventas por producto (cantidad y total) en un rango de fechas (solo ADMIN)' })
  @Roles('ADMIN')
  @Get('productos')
  productos(@Query() query: ReporteRangoQueryDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.reportsService.productos(usuario.cadenaId, query.desde, query.hasta);
  }

  @ApiOperation({ summary: 'Ventas por hora del día (0-23) en un rango de fechas (solo ADMIN)' })
  @Roles('ADMIN')
  @Get('franjas')
  franjas(@Query() query: ReporteRangoQueryDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.reportsService.franjas(usuario.cadenaId, query.desde, query.hasta);
  }
}
