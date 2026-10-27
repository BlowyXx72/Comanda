import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SyncService } from '../src/sync/sync.service.js';

// Fase 16 (§6.3, CU-07): sub-rangos de numeración por dispositivo y cobros
// sincronizados por POST /sync. Integración contra la base real, igual que
// cobro-inventario.spec.ts.
// Correr con: docker compose run --rm backend-1 npx vitest run test/cobro-offline.spec.ts
const sufijo = Date.now().toString(36);
const duenio = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const prisma = new PrismaService();

const nada = () => ({}) as never;
const gateway = {
  emitirPedidoActualizado: vi.fn(),
  emitirVentaRegistrada: vi.fn(),
  emitirInventarioActualizado: vi.fn(),
};
const colaFiscal = { encolar: vi.fn().mockResolvedValue(undefined) };
const inventoryService = new InventoryService(prisma, nada(), nada(), nada());
const ordersService = new OrdersService(prisma, nada(), nada(), nada(), nada(), inventoryService);
const payments = new PaymentsService(prisma, ordersService, gateway as never, inventoryService, colaFiscal as never);
const sync = new SyncService(ordersService, payments);

const CAJA_A = randomUUID();
const CAJA_B = randomUUID();
let cadenaId: string;
let productoId: string;
const sedes: string[] = [];

// Usuarios del JWT sin sede asignada (Fase 17): operan en cualquier sede.
const usuario = (rol: 'ADMIN' | 'CAJERO' | 'MESERO', sedeId: string | null = null) => ({
  userId: 'u',
  rol,
  cadenaId,
  sedeId,
});
let admin: ReturnType<typeof usuario>;
let cajero: ReturnType<typeof usuario>;
let mesero: ReturnType<typeof usuario>;

async function crearSede(rangoFin = 100) {
  const sede = await duenio.sede.create({
    data: { cadenaId, nombre: `Sede ${sedes.length}`, direccion: 'x', rangoInicio: 1, rangoFin, siguienteConsecutivo: 1 },
  });
  sedes.push(sede.id);
  return sede.id;
}

let mesas = 0;
async function crearPedidoListo(sedeId: string) {
  const mesa = await duenio.mesa.create({ data: { sedeId, numero: ++mesas, estado: 'OCUPADA' } });
  return duenio.pedido.create({
    data: {
      sedeId,
      mesaId: mesa.id,
      estado: 'LISTO',
      total: 8000,
      detalles: { create: [{ productoId, cantidad: 1, precioUnitario: 8000 }] },
    },
  });
}

const pagoOffline = (pedidoId: string, consecutivo: number, dispositivoId = CAJA_A, fechaHora = new Date().toISOString()) => ({
  id: randomUUID(),
  pedidoId,
  medio: 'EFECTIVO' as const,
  monto: 8000,
  consecutivo,
  dispositivoId,
  fechaHora,
});

const siguiente = async (sedeId: string) =>
  (await duenio.sede.findUniqueOrThrow({ where: { id: sedeId } })).siguienteConsecutivo;

beforeAll(async () => {
  await prisma.onModuleInit();
  cadenaId = (await duenio.cadena.create({ data: { nit: `offline-${sufijo}`, nombre: 'Offline', plan: 'BASICO' } })).id;
  productoId = (await duenio.producto.create({ data: { cadenaId, nombre: 'Arepa', precio: 8000, categoria: 'x' } })).id;
  admin = usuario('ADMIN');
  cajero = usuario('CAJERO');
  mesero = usuario('MESERO');
});

afterAll(async () => {
  const enSedes = { sedeId: { in: sedes } };
  await duenio.documentoFiscal.deleteMany({ where: enSedes });
  await duenio.pago.deleteMany({ where: { pedido: enSedes } });
  await duenio.pedidoDetalle.deleteMany({ where: { pedido: enSedes } });
  await duenio.pedido.deleteMany({ where: enSedes });
  await duenio.mesa.deleteMany({ where: enSedes });
  await duenio.rangoDispositivo.deleteMany({ where: enSedes });
  await duenio.producto.deleteMany({ where: { cadenaId } });
  await duenio.sede.deleteMany({ where: { id: { in: sedes } } });
  await duenio.cadena.deleteMany({ where: { id: cadenaId } });
  await prisma.onModuleDestroy();
  await duenio.$disconnect();
});

describe('reserva de sub-rangos por dispositivo', () => {
  it('dos cajas reciben bloques que no se cruzan y el cobro en línea sigue después de ellos', async () => {
    const sedeId = await crearSede();
    const a = await payments.reservarRango({ sedeId, dispositivoId: CAJA_A, cantidad: 10 }, cadenaId);
    const b = await payments.reservarRango({ sedeId, dispositivoId: CAJA_B }, cadenaId);
    expect([a.inicio, a.fin]).toEqual([1, 10]);
    expect([b.inicio, b.fin]).toEqual([11, 30]);

    const pedido = await crearPedidoListo(sedeId);
    const r = await payments.pagar({ pedidoId: pedido.id, medio: 'EFECTIVO', monto: 8000 }, cadenaId);
    expect(r.documentoFiscal.consecutivo).toBe(31);
  });

  it('cerca del final entrega solo lo que queda; con el rango agotado responde 409 sin mover el contador', async () => {
    const sedeId = await crearSede(15);
    await payments.reservarRango({ sedeId, dispositivoId: CAJA_A, cantidad: 10 }, cadenaId);
    const resto = await payments.reservarRango({ sedeId, dispositivoId: CAJA_A, cantidad: 10 }, cadenaId);
    expect([resto.inicio, resto.fin]).toEqual([11, 15]);
    expect(await siguiente(sedeId)).toBe(16);

    await expect(payments.reservarRango({ sedeId, dispositivoId: CAJA_A }, cadenaId)).rejects.toThrow(ConflictException);
    expect(await siguiente(sedeId)).toBe(16);
  });

  it('no reserva en una sede de otra cadena', async () => {
    const otra = await duenio.cadena.create({ data: { nit: `offline-otra-${sufijo}`, nombre: 'Otra', plan: 'BASICO' } });
    try {
      const sedeId = await crearSede();
      await expect(payments.reservarRango({ sedeId, dispositivoId: CAJA_A }, otra.id)).rejects.toThrow(/no encontrada/);
    } finally {
      await duenio.cadena.delete({ where: { id: otra.id } });
    }
  });
});

describe('cobro sincronizado (POST /sync con pagos)', () => {
  it('crea pago y documento con el consecutivo reservado y la hora de la caja; el reintento es DUPLICADO', async () => {
    const sedeId = await crearSede();
    await payments.reservarRango({ sedeId, dispositivoId: CAJA_A, cantidad: 5 }, cadenaId);
    const pedido = await crearPedidoListo(sedeId);
    const hace10Min = new Date(Date.now() - 10 * 60_000).toISOString();
    const dto = pagoOffline(pedido.id, 3, CAJA_A, hace10Min);

    expect(await sync.aplicar({ pagos: [dto] }, cajero)).toEqual([{ id: dto.id, resultado: 'CREADO' }]);
    expect(await sync.aplicar({ pagos: [dto] }, cajero)).toEqual([
      { id: dto.id, resultado: 'DUPLICADO' },
    ]);

    const doc = await duenio.documentoFiscal.findUniqueOrThrow({ where: { pedidoId: pedido.id } });
    expect(doc.consecutivo).toBe(3);
    expect(doc.estadoDian).toBe('PENDIENTE');
    const pago = await duenio.pago.findUniqueOrThrow({ where: { id: dto.id } });
    expect(pago.creadoEn.toISOString()).toBe(hace10Min);
    expect((await duenio.pedido.findUniqueOrThrow({ where: { id: pedido.id } })).estado).toBe('PAGADO');
    expect(colaFiscal.encolar).toHaveBeenCalledWith({ documentoFiscalId: doc.id, cadenaId });
  });

  it('una hora de la caja en el futuro se recorta a la hora del servidor', async () => {
    const sedeId = await crearSede();
    await payments.reservarRango({ sedeId, dispositivoId: CAJA_A, cantidad: 5 }, cadenaId);
    const pedido = await crearPedidoListo(sedeId);
    const dto = pagoOffline(pedido.id, 1, CAJA_A, new Date(Date.now() + 86_400_000).toISOString());
    await payments.pagarSincronizado(dto, cadenaId);
    const pago = await duenio.pago.findUniqueOrThrow({ where: { id: dto.id } });
    expect(pago.creadoEn.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('rechaza consecutivos fuera del bloque, de otra caja o ya usados, sin tumbar el resto del lote', async () => {
    const sedeId = await crearSede();
    await payments.reservarRango({ sedeId, dispositivoId: CAJA_A, cantidad: 5 }, cadenaId); // 1-5
    await payments.reservarRango({ sedeId, dispositivoId: CAJA_B, cantidad: 5 }, cadenaId); // 6-10
    const [p1, p2, p3, p4] = await Promise.all([1, 2, 3, 4].map(() => crearPedidoListo(sedeId)));

    const fueraDeRango = pagoOffline(p1.id, 50);
    const deOtraCaja = pagoOffline(p2.id, 7);
    const valido = pagoOffline(p3.id, 2);
    const repetido = pagoOffline(p4.id, 2);
    const r = await sync.aplicar({ pagos: [fueraDeRango, deOtraCaja, valido, repetido] }, admin);

    expect(r.map((x) => x.resultado)).toEqual(['RECHAZADO', 'RECHAZADO', 'CREADO', 'RECHAZADO']);
    expect(r[3]).toMatchObject({ motivo: expect.stringMatching(/ya se usó/) });
    // Los rechazados no dejaron nada a medias.
    expect(await duenio.pago.count({ where: { pedidoId: { in: [p1.id, p2.id, p4.id] } } })).toBe(0);
    expect((await duenio.pedido.findUniqueOrThrow({ where: { id: p4.id } })).estado).toBe('LISTO');
  });

  it('rechaza el cobro de un pedido que ya se pagó en línea mientras la caja estaba sin red', async () => {
    const sedeId = await crearSede();
    await payments.reservarRango({ sedeId, dispositivoId: CAJA_A, cantidad: 5 }, cadenaId);
    const pedido = await crearPedidoListo(sedeId);
    await payments.pagar({ pedidoId: pedido.id, medio: 'TARJETA', monto: 8000 }, cadenaId);

    const [r] = await sync.aplicar({ pagos: [pagoOffline(pedido.id, 1)] }, cajero);
    expect(r).toMatchObject({ resultado: 'RECHAZADO', motivo: expect.stringMatching(/LISTO/) });
  });

  it('aplica los mismos roles que POST /pedidos y POST /pagos', async () => {
    await expect(sync.aplicar({ pagos: [pagoOffline(randomUUID(), 1)] }, mesero)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(sync.aplicar({ pedidos: [{} as never] }, cajero)).rejects.toThrow(ForbiddenException);
    await expect(sync.aplicar({}, admin)).rejects.toThrow(/al menos un pedido o un pago/);
  });
});

// Fase 17: un cajero con sede asignada no cobra ni reserva numeración en otra
// sede, tampoco por POST /sync.
describe('usuario con sede asignada', () => {
  it('no cobra en línea un pedido de otra sede', async () => {
    const [suya, otra] = [await crearSede(), await crearSede()];
    const pedido = await crearPedidoListo(otra);
    await expect(
      payments.pagar({ pedidoId: pedido.id, medio: 'EFECTIVO', monto: 8000 }, cadenaId, suya),
    ).rejects.toThrow(ForbiddenException);
    expect((await duenio.pedido.findUniqueOrThrow({ where: { id: pedido.id } })).estado).toBe('LISTO');
  });

  it('no reserva numeración de otra sede', async () => {
    const [suya, otra] = [await crearSede(), await crearSede()];
    await expect(payments.reservarRango({ sedeId: otra, dispositivoId: CAJA_A }, cadenaId, suya)).rejects.toThrow(
      ForbiddenException,
    );
    expect(await siguiente(otra)).toBe(1);
  });

  it('en /sync rechaza solo los elementos de otra sede', async () => {
    const [suya, otra] = [await crearSede(), await crearSede()];
    await payments.reservarRango({ sedeId: suya, dispositivoId: CAJA_A, cantidad: 5 }, cadenaId);
    await payments.reservarRango({ sedeId: otra, dispositivoId: CAJA_A, cantidad: 5 }, cadenaId);
    const [deLaSuya, deOtra] = [await crearPedidoListo(suya), await crearPedidoListo(otra)];

    const r = await sync.aplicar(
      { pagos: [pagoOffline(deOtra.id, 1), pagoOffline(deLaSuya.id, 1)] },
      usuario('CAJERO', suya),
    );
    expect(r.map((x) => x.resultado)).toEqual(['RECHAZADO', 'CREADO']);
    expect(r[0]).toMatchObject({ motivo: expect.stringMatching(/sede asignada/) });
  });
});
