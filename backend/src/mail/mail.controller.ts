import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { ColaCorreoService } from './cola-correo.service.js';

export class ResumenDiarioDto {
  // AAAA-MM-DD; por defecto, hoy (zona de Bogotá).
  @IsOptional()
  @IsDateString({ strict: true })
  fecha?: string;
}

// Consumido por: /panel ("Enviar resumen del día"). El resumen sale solo a
// las 23:00 (trabajo programado del worker); este endpoint lo dispara a mano
// para la demo, solo para la cadena del ADMIN.
@ApiTags('correo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('correo')
export class MailController {
  constructor(private readonly colaCorreo: ColaCorreoService) {}

  @ApiOperation({ summary: 'Encola el resumen diario de ventas para los ADMIN de la cadena (solo ADMIN)' })
  @Roles('ADMIN')
  @HttpCode(202)
  @Post('resumen-diario')
  async resumenDiario(@Body() dto: ResumenDiarioDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    await this.colaCorreo.encolarResumen(usuario.cadenaId, dto.fecha);
    return { encolado: true };
  }
}
