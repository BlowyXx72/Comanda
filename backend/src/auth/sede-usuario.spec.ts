import { ForbiddenException } from '@nestjs/common';
import { BranchesController } from '../branches/branches.controller.js';
import { verificarSedeDelUsuario } from './sede-usuario.js';

// Fase 17: sede asignada al usuario.
describe('verificarSedeDelUsuario', () => {
  it('sin sede asignada (ADMIN) deja operar en cualquier sede', () => {
    expect(() => verificarSedeDelUsuario({ sedeId: null }, 'sede-b')).not.toThrow();
  });

  it('con sede asignada solo deja operar en esa', () => {
    expect(() => verificarSedeDelUsuario({ sedeId: 'sede-a' }, 'sede-a')).not.toThrow();
    expect(() => verificarSedeDelUsuario({ sedeId: 'sede-a' }, 'sede-b')).toThrow(ForbiddenException);
  });
});

describe('GET /sedes con sede asignada', () => {
  const sedes = [{ id: 'sede-a' }, { id: 'sede-b' }];
  const controller = new BranchesController({ listar: async () => sedes } as never, {} as never);
  const usuario = (sedeId: string | null) => ({ userId: 'u', email: 'x', rol: 'CAJERO' as const, cadenaId: 'c', sedeId });

  it('devuelve solo la sede del usuario', async () => {
    expect(await controller.listar(usuario('sede-b'))).toEqual([{ id: 'sede-b' }]);
  });

  it('sin sede asignada devuelve todas', async () => {
    expect(await controller.listar(usuario(null))).toEqual(sedes);
  });
});
