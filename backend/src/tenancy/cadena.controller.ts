import { Controller, Get, Headers, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { CadenaPorHostService } from './cadena-por-host.service.js';

// Fase 20B (§5.2): la cadena de un subdominio, para las pantallas públicas,
// y la del usuario, para armar los QR de las mesas con su subdominio.
@ApiTags('cadena')
@Controller()
export class CadenaController {
  constructor(private readonly cadenaPorHost: CadenaPorHostService) {}

  // Sin JWT: el comensal abre lacadena.dominio/menu/:sedeId desde el QR y el
  // frontend necesita saber de qué cadena es. Va bajo /public/ para que Nginx
  // le aplique el mismo límite de tasa que al resto de rutas públicas.
  @ApiOperation({ summary: 'Cadena del subdominio por el que se entró (sin autenticación); 404 si no es de ninguna' })
  @Get('public/cadena')
  delHost(@Headers('host') host: string | undefined) {
    return this.cadenaPorHost.resolverObligatoria(host);
  }

  @ApiOperation({ summary: 'Cadena del usuario, con la URL pública de su subdominio (null si no hay)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('cadena')
  delUsuario(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.cadenaPorHost.datosDeCadena(usuario.cadenaId);
  }
}
