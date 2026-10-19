import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Prueba de la Fase 13 (§5.1): el cliente de la réplica lee pero no escribe.
// DECISIÓN DE PROTOTIPO: prueba de integración contra la réplica real.
// Correr con: docker compose run --rm backend-1 npx vitest run test/replica-solo-lectura.spec.ts
const replica = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_REPLICA }) });
const duenio = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const sufijo = Date.now().toString(36);
const ids: { cadenaA?: string; cadenaB?: string; sedeA?: string; sedeB?: string } = {};

afterAll(async () => {
  const sedes = [ids.sedeA, ids.sedeB].filter((x): x is string => !!x);
  const cadenas = [ids.cadenaA, ids.cadenaB].filter((x): x is string => !!x);
  await duenio.sede.deleteMany({ where: { id: { in: sedes } } });
  await duenio.cadena.deleteMany({ where: { id: { in: cadenas } } });
  await replica.$disconnect();
  await duenio.$disconnect();
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

// Fase 13 (US-13-3): la réplica es una copia física, así que las políticas RLS
// de la Fase 12 viajan con ella. Se escribe con el rol dueño en el primario y
// se verifica el aislamiento leyendo de la réplica con comanda_app.
describe('RLS en la réplica con datos de dos cadenas', () => {
  const conCadena = <T>(cadenaId: string, fn: (tx: Parameters<Parameters<typeof replica.$transaction>[0]>[0]) => Promise<T>) =>
    replica.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.cadena_id', ${cadenaId}, true)`;
      return fn(tx);
    });

  beforeAll(async () => {
    const a = await duenio.cadena.create({ data: { nit: `rep-a-${sufijo}`, nombre: 'Réplica A', plan: 'BASICO' } });
    const b = await duenio.cadena.create({ data: { nit: `rep-b-${sufijo}`, nombre: 'Réplica B', plan: 'BASICO' } });
    ids.cadenaA = a.id;
    ids.cadenaB = b.id;
    const rango = { rangoInicio: 1, rangoFin: 100, siguienteConsecutivo: 1 };
    ids.sedeA = (await duenio.sede.create({ data: { cadenaId: a.id, nombre: 'Sede A', direccion: 'x', ...rango } })).id;
    ids.sedeB = (await duenio.sede.create({ data: { cadenaId: b.id, nombre: 'Sede B', direccion: 'x', ...rango } })).id;

    // Espera a que la replicación asíncrona alcance las filas recién escritas.
    for (let i = 0; i < 50; i++) {
      const enA = await conCadena(a.id, (tx) => tx.sede.count({ where: { id: ids.sedeA } }));
      const enB = await conCadena(b.id, (tx) => tx.sede.count({ where: { id: ids.sedeB } }));
      if (enA === 1 && enB === 1) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  it('sin app.cadena_id la réplica no devuelve ninguna fila', async () => {
    expect(await replica.cadena.findMany()).toHaveLength(0);
    expect(await replica.sede.findMany()).toHaveLength(0);
  });

  it('con la cadena A la réplica no devuelve filas de la cadena B', async () => {
    const sedes = await conCadena(ids.cadenaA!, (tx) => tx.sede.findMany());
    expect(sedes.map((s) => s.id)).toEqual([ids.sedeA]);
    const sedesB = await conCadena(ids.cadenaB!, (tx) => tx.sede.findMany());
    expect(sedesB.map((s) => s.id)).toEqual([ids.sedeB]);
  });
});
