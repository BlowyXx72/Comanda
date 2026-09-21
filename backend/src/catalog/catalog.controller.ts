import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { CatalogService } from './catalog.service.js';

// Consumido por: mesero (armador de pedido en /mesas).
@ApiTags('productos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('productos')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @ApiOperation({ summary: 'Lista el catálogo de productos de la cadena del usuario' })
  @Get()
  listar(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.catalogService.listar(usuario.cadenaId);
  }
}
