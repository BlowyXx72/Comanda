import { ForbiddenException } from '@nestjs/common';

// Fase 17: un usuario con sede asignada (cajero, mesero) solo opera en esa
// sede; sin sede (el ADMIN) opera en todas las de su cadena. Es un filtro de
// aplicación más, encima del de cadena (filtros por cadenaId + RLS).
// DECISIÓN DE PROTOTIPO: no hay política RLS por sede; con el filtro de
// aplicación alcanza para el prototipo (ver docs/ronda3-parte1-pendientes.md).
export function verificarSedeDelUsuario(usuario: { sedeId: string | null }, sedeId: string) {
  if (usuario.sedeId && usuario.sedeId !== sedeId) {
    throw new ForbiddenException('El usuario solo puede operar en su sede asignada');
  }
}
