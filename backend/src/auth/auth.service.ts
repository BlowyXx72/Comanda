import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from './jwt-payload.interface.js';

// Consumido por AuthController (POST /auth/login), a su vez llamado desde la
// pantalla de login del frontend.
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // cadenaIdRequerida (Fase 20B): la cadena del subdominio por el que se
  // entró; un usuario de otra cadena recibe el mismo 401 que una clave mala,
  // para no confirmar que el correo existe.
  async login(email: string, password: string, cadenaIdRequerida?: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    if (!usuario) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValida = await bcrypt.compare(password, usuario.passwordHash);
    if (!passwordValida || (cadenaIdRequerida && usuario.cadenaId !== cadenaIdRequerida)) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      cadenaId: usuario.cadenaId,
      sedeId: usuario.sedeId,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      usuario: {
        id: usuario.id,
        email: usuario.email,
        rol: usuario.rol,
        cadenaId: usuario.cadenaId,
        sedeId: usuario.sedeId,
      },
    };
  }
}
