import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UsuarioAutenticado } from '../jwt-payload.interface.js';

// Uso: metodo(@UsuarioActual() usuario: UsuarioAutenticado) en un endpoint
// protegido por JwtAuthGuard.
export const UsuarioActual = createParamDecorator((_data: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
  const request = ctx.switchToHttp().getRequest<{ user: UsuarioAutenticado }>();
  return request.user;
});
