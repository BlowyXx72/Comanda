import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RolUsuario } from '../../generated/prisma/enums.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { UsuarioAutenticado } from '../jwt-payload.interface.js';

// Debe ir SIEMPRE después de JwtAuthGuard: depende de que `req.user` ya
// exista. Si el endpoint no tiene @Roles(...), deja pasar a cualquier
// usuario autenticado.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RolUsuario[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: UsuarioAutenticado }>();
    return !!user && requiredRoles.includes(user.rol);
  }
}
