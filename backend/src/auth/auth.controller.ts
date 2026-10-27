import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CadenaPorHostService } from '../tenancy/cadena-por-host.service.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import type { UsuarioAutenticado } from './jwt-payload.interface.js';

// Consumido por: pantalla de login del frontend (mesero/cajero/admin).
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cadenaPorHost: CadenaPorHostService,
  ) {}

  @ApiOperation({ summary: 'Login con email/password, devuelve el JWT y el usuario autenticado' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Headers('host') host: string | undefined) {
    // Fase 20B: por el subdominio de una cadena, solo entran sus usuarios.
    const cadenaDelHost = await this.cadenaPorHost.resolver(host);
    return this.authService.login(dto.email, dto.password, cadenaDelHost?.id);
  }

  // Usado por el frontend para validar el token guardado y recuperar el
  // usuario/rol sin tener que decodificar el JWT en el cliente.
  @ApiOperation({ summary: 'Devuelve el usuario del JWT enviado (valida la sesión)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request & { user: UsuarioAutenticado }) {
    return req.user;
  }
}
