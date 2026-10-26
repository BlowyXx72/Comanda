import type { RolUsuario } from '../generated/prisma/enums.js';

export interface JwtPayload {
  sub: string;
  email: string;
  rol: RolUsuario;
  cadenaId: string;
  // Fase 17: sede asignada (null = todas las de la cadena). Opcional en el
  // tipo porque los tokens emitidos antes de la Fase 17 no la traen.
  sedeId?: string | null;
}

// Lo que queda disponible en `req.user` tras pasar por JwtAuthGuard.
export interface UsuarioAutenticado {
  userId: string;
  email: string;
  rol: RolUsuario;
  cadenaId: string;
  sedeId: string | null;
}
