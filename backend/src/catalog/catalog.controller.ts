import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { CatalogService } from './catalog.service.js';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto.js';
import { CrearProductoDto } from './dto/crear-producto.dto.js';
import { ListarProductosQueryDto } from './dto/listar-productos-query.dto.js';

// Consumido por: mesero (armador de pedido en /mesas, GET) y ADMIN (catálogo
// centralizado en /catalogo — POST/PATCH/DELETE, Fase 10, CU-08).
@ApiTags('productos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('productos')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @ApiOperation({
    summary: 'Lista el catálogo de productos de la cadena del usuario (solo activos, salvo ADMIN con incluirInactivos=true)',
  })
  @Get()
  listar(@Query() query: ListarProductosQueryDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    const incluirInactivos = !!query.incluirInactivos && usuario.rol === 'ADMIN';
    return this.catalogService.listar(usuario.cadenaId, incluirInactivos);
  }

  @ApiOperation({ summary: 'Crea un producto en el catálogo de la cadena (solo ADMIN)' })
  @Roles('ADMIN')
  @Post()
  crear(@Body() dto: CrearProductoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.catalogService.crear(usuario.cadenaId, dto);
  }

  @ApiOperation({ summary: 'Edita un producto del catálogo (solo ADMIN)' })
  @Roles('ADMIN')
  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarProductoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.catalogService.actualizar(id, usuario.cadenaId, dto);
  }

  @ApiOperation({ summary: 'Desactiva un producto del catálogo (baja lógica, solo ADMIN)' })
  @Roles('ADMIN')
  @Delete(':id')
  desactivar(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.catalogService.desactivar(id, usuario.cadenaId);
  }
}
