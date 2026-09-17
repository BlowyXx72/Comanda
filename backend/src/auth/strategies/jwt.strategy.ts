import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload, UsuarioAutenticado } from '../jwt-payload.interface.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // DECISIÓN DE PROTOTIPO: fallback solo para que el tipo cierre si falta
      // la env var; .env.example siempre trae un JWT_SECRET real.
      secretOrKey: process.env.JWT_SECRET ?? 'inseguro-solo-para-desarrollo-local',
    });
  }

  // El valor de retorno queda disponible como `req.user` en cualquier ruta
  // protegida por JwtAuthGuard.
  validate(payload: JwtPayload): UsuarioAutenticado {
    return {
      userId: payload.sub,
      email: payload.email,
      rol: payload.rol,
      cadenaId: payload.cadenaId,
    };
  }
}
