import { Controller, Get, Headers, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CadenaPorHostService } from '../tenancy/cadena-por-host.service.js';
import { PublicMenuService } from './public-menu.service.js';

// Consumido por: vista pública del comensal (/menu/:cadenaId/:sedeId en el
// frontend), a la que se llega escaneando el QR de la mesa (CU-03).
// Sin JwtAuthGuard a propósito: el comensal no inicia sesión.
// Fase 16B: cada producto trae la URL de su foto (ImagenesPublicasController
// en local, CloudFront en AWS).
// TODO PRODUCCIÓN: cachear esta respuesta; hoy se lee de Postgres.
@ApiTags('menu-publico')
@Controller('menu')
export class PublicMenuController {
  constructor(
    private readonly publicMenuService: PublicMenuService,
    private readonly cadenaPorHost: CadenaPorHostService,
  ) {}

  @ApiOperation({ summary: 'Menú público de una sede, agrupado por categoría (sin autenticación)' })
  @Get(':cadenaId/:sedeId')
  async obtener(
    @Param('cadenaId', new ParseUUIDPipe()) cadenaId: string,
    @Param('sedeId', new ParseUUIDPipe()) sedeId: string,
    @Headers('host') host: string | undefined,
  ) {
    // Fase 20B: por el subdominio de una cadena no se ve el menú de otra.
    await this.cadenaPorHost.verificar(host, cadenaId);
    return this.publicMenuService.obtener(cadenaId, sedeId);
  }
}
