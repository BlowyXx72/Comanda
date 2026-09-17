import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import type { UsuarioAutenticado } from './jwt-payload.interface.js';

// Consumido por: pantalla de login del frontend (mesero/cajero/admin).
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  // Usado por el frontend para validar el token guardado y recuperar el
  // usuario/rol sin tener que decodificar el JWT en el cliente.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request & { user: UsuarioAutenticado }) {
    return req.user;
  }
}
