import type { RolUsuario } from '../generated/prisma/enums.js';

export interface JwtPayload {
  sub: string;
  email: string;
  rol: RolUsuario;
  cadenaId: string;
}

// Lo que queda disponible en `req.user` tras pasar por JwtAuthGuard.
export interface UsuarioAutenticado {
  userId: string;
  email: string;
  rol: RolUsuario;
  cadenaId: string;
}
