import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicMenuService } from './public-menu.service.js';

// Consumido por: vista pública del comensal (/menu/:cadenaId/:sedeId en el
// frontend), a la que se llega escaneando el QR de la mesa (CU-03).
// Sin JwtAuthGuard a propósito: el comensal no inicia sesión.
// TODO PRODUCCIÓN: servir las imágenes del menú desde una CDN (§5.1) y
// cachear esta respuesta; hoy el menú no tiene imágenes y se lee de Postgres.
@ApiTags('menu-publico')
@Controller('menu')
export class PublicMenuController {
  constructor(private readonly publicMenuService: PublicMenuService) {}

  @ApiOperation({ summary: 'Menú público de una sede, agrupado por categoría (sin autenticación)' })
  @Get(':cadenaId/:sedeId')
  obtener(
    @Param('cadenaId', new ParseUUIDPipe()) cadenaId: string,
    @Param('sedeId', new ParseUUIDPipe()) sedeId: string,
  ) {
    return this.publicMenuService.obtener(cadenaId, sedeId);
  }
}
