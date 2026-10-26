import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Fase 15 (ronda 3, Parte 1): el cobro descuenta inventario por receta dentro
// de la misma transacción (Fase 11, §6.2) y, si el cobro falla, no queda
// ningún movimiento ni se consume el consecutivo.
// DECISIÓN DE PROTOTIPO: prueba de integración contra la base real, igual que
// rls-aislamiento.spec.ts; PaymentsService corre con el PrismaService de
// verdad (rol comanda_app + RLS) y solo se reemplazan los WebSocket y la cola.
// Correr con: docker compose run --rm backend-1 npx vitest run test/cobro-inventario.spec.ts
const sufijo = Date.now().toString(36);
const duenio = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const prisma = new PrismaService();

const gateway = {
  emitirPedidoActualizado: vi.fn(),
  emitirVentaRegistrada: vi.fn(),
  emitirInventarioActualizado: vi.fn(),
};
const colaFiscal = { encolar: vi.fn().mockResolvedValue(undefined) };
const ordersService = new OrdersService(prisma, never(), never(), never(), never());
const inventoryService = new InventoryService(prisma, never(), never(), never());
const payments = new PaymentsService(prisma, ordersService, gateway as never, inventoryService, colaFiscal as never);

// Dependencias que pagar() no usa en este camino.
function never() {
  return {} as never;
}

let cadenaId: string;
const sedes: string[] = [];
let hamburguesa: string;
let gaseosa: string;
let pan: string;
let carne: string;

async function crearSede(rangoFin: number, siguienteConsecutivo: number) {
  const sede = await duenio.sede.create({
    data: { cadenaId, nombre: `Sede ${sedes.length}`, direccion: 'x', rangoInicio: 1, rangoFin, siguienteConsecutivo },
  });
  sedes.push(sede.id);
  return sede.id;
}

// Pedido LISTO en una mesa ocupada: 2 hamburguesas (con receta) + 1 gaseosa (sin receta).
async function crearPedidoListo(sedeId: string) {
  const mesa = await duenio.mesa.create({ data: { sedeId, numero: 1, estado: 'OCUPADA' } });
  return duenio.pedido.create({
    data: {
      sedeId,
      mesaId: mesa.id,
      estado: 'LISTO',
      total: 25000,
      detalles: {
        create: [
          { productoId: hamburguesa, cantidad: 2, precioUnitario: 10000 },
          { productoId: gaseosa, cantidad: 1, precioUnitario: 5000 },
        ],
      },
    },
  });
}

beforeAll(async () => {
  await prisma.onModuleInit();
  cadenaId = (await duenio.cadena.create({ data: { nit: `cobro-${sufijo}`, nombre: 'Cobro', plan: 'BASICO' } })).id;
  hamburguesa = (await duenio.producto.create({ data: { cadenaId, nombre: 'Hamburguesa', precio: 10000, categoria: 'x' } })).id;
  gaseosa = (await duenio.producto.create({ data: { cadenaId, nombre: 'Gaseosa', precio: 5000, categoria: 'x' } })).id;
  pan = (await duenio.insumo.create({ data: { cadenaId, nombre: 'Pan', unidad: 'und', costoUnitario: 500 } })).id;
  carne = (await duenio.insumo.create({ data: { cadenaId, nombre: 'Carne', unidad: 'kg', costoUnitario: 30000 } })).id;
  await duenio.receta.createMany({
    data: [
      { productoId: hamburguesa, insumoId: pan, cantidad: 1 },
      { productoId: hamburguesa, insumoId: carne, cantidad: 0.15 },
    ],
  });
});

afterAll(async () => {
  const pedido = { sedeId: { in: sedes } };
  await duenio.movimientoInventario.deleteMany({ where: { sedeId: { in: sedes } } });
  await duenio.documentoFiscal.deleteMany({ where: { sedeId: { in: sedes } } });
  await duenio.pago.deleteMany({ where: { pedido } });
  await duenio.pedidoDetalle.deleteMany({ where: { pedido } });
  await duenio.pedido.deleteMany({ where: pedido });
  await duenio.mesa.deleteMany({ where: { sedeId: { in: sedes } } });
  await duenio.receta.deleteMany({ where: { productoId: { in: [hamburguesa, gaseosa] } } });
  await duenio.insumo.deleteMany({ where: { cadenaId } });
  await duenio.producto.deleteMany({ where: { cadenaId } });
  await duenio.sede.deleteMany({ where: { id: { in: sedes } } });
  await duenio.cadena.deleteMany({ where: { id: cadenaId } });
  await prisma.onModuleDestroy();
  await duenio.$disconnect();
});

describe('PaymentsService.pagar con descuento de inventario', () => {
  it('descuenta la receta por cantidad, numera, libera la mesa y encola el documento', async () => {
    const sedeId = await crearSede(100, 1);
    const pedido = await crearPedidoListo(sedeId);

    const r = await payments.pagar({ pedidoId: pedido.id, medio: 'EFECTIVO', monto: 25000 }, cadenaId);

    expect(r.documentoFiscal.consecutivo).toBe(1);
    expect(r.documentoFiscal.estadoDian).toBe('PENDIENTE');
    expect(r.pedido.estado).toBe('PAGADO');
    expect(r.pedido.mesa?.estado).toBe('LIBRE');

    const movimientos = await duenio.movimientoInventario.findMany({ where: { sedeId } });
    const porInsumo = Object.fromEntries(movimientos.map((m) => [m.insumoId, m]));
    // La gaseosa no tiene receta: solo hay movimientos de pan y carne.
    expect(movimientos).toHaveLength(2);
    expect(porInsumo[pan].tipo).toBe('SALIDA');
    expect(porInsumo[pan].cantidad.toNumber()).toBe(2);
    expect(porInsumo[carne].cantidad.toNumber()).toBe(0.3);

    expect((await duenio.sede.findUniqueOrThrow({ where: { id: sedeId } })).siguienteConsecutivo).toBe(2);
    expect(colaFiscal.encolar).toHaveBeenCalledWith({ documentoFiscalId: r.documentoFiscal.id, cadenaId });
    expect(gateway.emitirInventarioActualizado).toHaveBeenCalledWith(cadenaId, { sedeId, pedidoId: pedido.id });
  });

  it('con el rango fiscal agotado revierte todo: sin movimientos, sin pago y sin avanzar el consecutivo', async () => {
    const sedeId = await crearSede(1, 2);
    const pedido = await crearPedidoListo(sedeId);

    await expect(payments.pagar({ pedidoId: pedido.id, medio: 'TARJETA', monto: 25000 }, cadenaId)).rejects.toThrow(
      ConflictException,
    );

    expect(await duenio.movimientoInventario.count({ where: { sedeId } })).toBe(0);
    expect(await duenio.pago.count({ where: { pedidoId: pedido.id } })).toBe(0);
    expect((await duenio.pedido.findUniqueOrThrow({ where: { id: pedido.id } })).estado).toBe('LISTO');
    expect((await duenio.sede.findUniqueOrThrow({ where: { id: sedeId } })).siguienteConsecutivo).toBe(2);
  });

  it('rechaza un monto distinto del total sin tocar el inventario', async () => {
    const sedeId = await crearSede(100, 1);
    const pedido = await crearPedidoListo(sedeId);

    await expect(payments.pagar({ pedidoId: pedido.id, medio: 'EFECTIVO', monto: 20000 }, cadenaId)).rejects.toThrow(
      BadRequestException,
    );
    expect(await duenio.movimientoInventario.count({ where: { sedeId } })).toBe(0);
  });
});
