import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';
import { cargarUsuarioVigente } from '../auth/usuario-vigente.js';
import { Prisma } from '../generated/prisma/client.js';
import { UsersService } from './users.service.js';

// Prisma falso: conCadena ejecuta el callback con un `tx` de mocks.
function crearPrisma(tx: Record<string, Record<string, ReturnType<typeof vi.fn>>>) {
  return { conCadena: vi.fn((_cadenaId: string, fn: (t: unknown) => unknown) => fn(tx)) } as never;
}

describe('UsersService', () => {
  const sedePropia = { cadenaId: 'cadena-a' };

  it('crea el usuario con la sede asignada y sin devolver el hash', async () => {
    const tx = {
      sede: { findUnique: vi.fn().mockResolvedValue(sedePropia) },
      usuario: { create: vi.fn().mockResolvedValue({ id: 'u1' }) },
    };
    const service = new UsersService(crearPrisma(tx));

    await service.crear('cadena-a', { email: 'm@x.com', password: 'secreta', rol: 'MESERO', sedeId: 'sede-1' });

    const args = tx.usuario.create.mock.calls[0][0];
    expect(args.data).toMatchObject({ cadenaId: 'cadena-a', email: 'm@x.com', rol: 'MESERO', sedeId: 'sede-1' });
    expect(args.data.passwordHash).not.toBe('secreta');
    expect(args.select.passwordHash).toBeUndefined();
  });

  it('rechaza una sede de otra cadena', async () => {
    const tx = {
      sede: { findUnique: vi.fn().mockResolvedValue({ cadenaId: 'cadena-b' }) },
      usuario: { create: vi.fn() },
    };
    const service = new UsersService(crearPrisma(tx));

    await expect(
      service.crear('cadena-a', { email: 'm@x.com', password: 'secreta', rol: 'MESERO', sedeId: 'sede-ajena' }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.usuario.create).not.toHaveBeenCalled();
  });

  it('traduce el correo duplicado a 409', async () => {
    const duplicado = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });
    const tx = { sede: { findUnique: vi.fn() }, usuario: { create: vi.fn().mockRejectedValue(duplicado) } };
    const service = new UsersService(crearPrisma(tx));

    await expect(service.crear('cadena-a', { email: 'm@x.com', password: 'secreta', rol: 'CAJERO' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('no deja que el ADMIN se desactive ni se quite el rol', async () => {
    const service = new UsersService(crearPrisma({}));
    await expect(service.actualizar('yo', 'cadena-a', 'yo', { activo: false })).rejects.toThrow(BadRequestException);
    await expect(service.actualizar('yo', 'cadena-a', 'yo', { rol: 'MESERO' })).rejects.toThrow(BadRequestException);
  });

  it('no edita usuarios de otra cadena', async () => {
    const tx = { usuario: { findUnique: vi.fn().mockResolvedValue({ cadenaId: 'cadena-b' }), update: vi.fn() } };
    const service = new UsersService(crearPrisma(tx));

    await expect(service.actualizar('u2', 'cadena-a', 'yo', { sedeId: null })).rejects.toThrow(NotFoundException);
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });

  it('sedeId null quita la sede (todas las de la cadena)', async () => {
    const tx = {
      sede: { findUnique: vi.fn() },
      usuario: { findUnique: vi.fn().mockResolvedValue(sedePropia), update: vi.fn().mockResolvedValue({}) },
    };
    const service = new UsersService(crearPrisma(tx));

    await service.actualizar('u2', 'cadena-a', 'yo', { sedeId: null });

    expect(tx.usuario.update.mock.calls[0][0].data.sedeId).toBeNull();
    expect(tx.sede.findUnique).not.toHaveBeenCalled();
  });
});

describe('cargarUsuarioVigente', () => {
  const payload = { sub: 'u1', email: 'm@x.com', rol: 'MESERO' as const, cadenaId: 'cadena-a', sedeId: 'sede-vieja' };
  const fila = { id: 'u1', email: 'm@x.com', rol: 'MESERO', cadenaId: 'cadena-a', sedeId: 'sede-nueva', activo: true };

  it('toma la sede de la base, no la del token', async () => {
    const prisma = crearPrisma({ usuario: { findUnique: vi.fn().mockResolvedValue(fila) } });
    expect((await cargarUsuarioVigente(prisma, payload))?.sedeId).toBe('sede-nueva');
  });

  it('devuelve null si el usuario fue desactivado', async () => {
    const prisma = crearPrisma({ usuario: { findUnique: vi.fn().mockResolvedValue({ ...fila, activo: false }) } });
    expect(await cargarUsuarioVigente(prisma, payload)).toBeNull();
  });
});
