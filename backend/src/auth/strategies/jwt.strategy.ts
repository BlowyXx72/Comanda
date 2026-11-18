import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { JwtPayload, UsuarioAutenticado } from '../jwt-payload.interface.js';
import { cargarUsuarioVigente } from '../usuario-vigente.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // DECISIÓN DE PROTOTIPO: fallback solo para que el tipo cierre si falta
      // la env var; .env.example siempre trae un JWT_SECRET real.
      secretOrKey: process.env.JWT_SECRET ?? 'inseguro-solo-para-desarrollo-local',
    });
  }

  // El valor de retorno queda disponible como `req.user` en cualquier ruta
  // protegida por JwtAuthGuard. Rol y sede salen de la base, no del token,
  // para que los cambios hechos en /usuarios apliquen de inmediato.
  async validate(payload: JwtPayload): Promise<UsuarioAutenticado> {
    const usuario = await cargarUsuarioVigente(this.prisma, payload);
    if (!usuario) {
      throw new UnauthorizedException('La sesión ya no es válida');
    }
    return usuario;
  }
}
