import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Prueba de aislamiento obligatoria de la Fase 12 (§6.1): demuestra que RLS
// aísla de verdad con el rol `comanda_app`, sin pasar por ningún servicio.
// DECISIÓN DE PROTOTIPO: es una prueba de integración contra la base real
// (el proyecto no tiene base de pruebas aparte); crea dos cadenas propias con
// el rol dueño y las borra al terminar, sin tocar los datos del seed.
// Correr con: docker compose run --rm backend-1 npx vitest run test/rls-aislamiento.spec.ts
const sufijo = Date.now().toString(36);
const duenio = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const app = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_APP }) });

let cadenaA: string;
let cadenaB: string;
let sedeA: string;
let sedeB: string;

// Misma mecánica que PrismaService.conCadena(): set_config local a la transacción.
const conCadena = <T>(cadenaId: string, fn: (tx: Parameters<Parameters<typeof app.$transaction>[0]>[0]) => Promise<T>) =>
  app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.cadena_id', ${cadenaId}, true)`;
    return fn(tx);
  });

beforeAll(async () => {
  const a = await duenio.cadena.create({ data: { nit: `rls-a-${sufijo}`, nombre: 'RLS A', plan: 'BASICO' } });
  const b = await duenio.cadena.create({ data: { nit: `rls-b-${sufijo}`, nombre: 'RLS B', plan: 'BASICO' } });
  cadenaA = a.id;
  cadenaB = b.id;
  const rango = { rangoInicio: 1, rangoFin: 100, siguienteConsecutivo: 1 };
  sedeA = (await duenio.sede.create({ data: { cadenaId: cadenaA, nombre: 'Sede A', direccion: 'x', ...rango } })).id;
  sedeB = (await duenio.sede.create({ data: { cadenaId: cadenaB, nombre: 'Sede B', direccion: 'x', ...rango } })).id;
  await duenio.mesa.create({ data: { sedeId: sedeA, numero: 1 } });
  await duenio.mesa.create({ data: { sedeId: sedeB, numero: 1 } });
});

afterAll(async () => {
  await duenio.mesa.deleteMany({ where: { sedeId: { in: [sedeA, sedeB] } } });
  await duenio.sede.deleteMany({ where: { id: { in: [sedeA, sedeB] } } });
  await duenio.cadena.deleteMany({ where: { id: { in: [cadenaA, cadenaB] } } });
  await app.$disconnect();
  await duenio.$disconnect();
});

describe('RLS con el rol comanda_app', () => {
  it('sin app.cadena_id seteado devuelve 0 filas (tabla directa y tabla con EXISTS)', async () => {
    expect(await app.cadena.findMany()).toHaveLength(0);
    expect(await app.sede.findMany()).toHaveLength(0);
    expect(await app.mesa.findMany()).toHaveLength(0);
  });

  it('con la cadena A no devuelve filas de la cadena B', async () => {
    const { cadenas, sedes, mesas } = await conCadena(cadenaA, async (tx) => ({
      cadenas: await tx.cadena.findMany(),
      sedes: await tx.sede.findMany(),
      mesas: await tx.mesa.findMany(),
    }));
    expect(cadenas.map((c) => c.id)).toEqual([cadenaA]);
    expect(sedes.map((s) => s.id)).toEqual([sedeA]);
    expect(mesas.map((m) => m.sedeId)).toEqual([sedeA]);
  });

  it('con la cadena A no se puede insertar una sede de la cadena B (WITH CHECK)', async () => {
    await expect(
      conCadena(cadenaA, (tx) =>
        tx.sede.create({
          data: { cadenaId: cadenaB, nombre: 'Intrusa', direccion: 'x', rangoInicio: 1, rangoFin: 2, siguienteConsecutivo: 1 },
        }),
      ),
    ).rejects.toThrow();
  });

  it('un UPDATE de la cadena A no afecta filas de la cadena B', async () => {
    const r = await conCadena(cadenaA, (tx) => tx.sede.updateMany({ where: { id: sedeB }, data: { nombre: 'Hackeada' } }));
    expect(r.count).toBe(0);
    expect((await duenio.sede.findUniqueOrThrow({ where: { id: sedeB } })).nombre).toBe('Sede B');
  });
});
