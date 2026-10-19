import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Prueba de la Fase 13 (§5.1): el cliente de la réplica lee pero no escribe.
// DECISIÓN DE PROTOTIPO: prueba de integración contra la réplica real.
// Correr con: docker compose run --rm backend-1 npx vitest run test/replica-solo-lectura.spec.ts
const replica = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_REPLICA }) });

afterAll(async () => {
  await replica.$disconnect();
});

describe('cliente de la réplica de lectura', () => {
  it('está en recuperación (es una réplica)', async () => {
    const filas = await replica.$queryRaw<{ r: boolean }[]>`SELECT pg_is_in_recovery() AS r`;
    expect(filas[0].r).toBe(true);
  });

  it('permite leer con set_config de la cadena', async () => {
    const n = await replica.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.cadena_id', 'cualquiera', true)`;
      return tx.cadena.count();
    });
    expect(n).toBe(0); // RLS también aplica en la réplica: cadena inexistente, 0 filas
  });

  it('rechaza un intento de escritura', async () => {
    await expect(
      replica.cadena.create({ data: { nit: `replica-${Date.now()}`, nombre: 'No debe existir', plan: 'BASICO' } }),
    ).rejects.toThrow(/read-only transaction/i);
  });
});
