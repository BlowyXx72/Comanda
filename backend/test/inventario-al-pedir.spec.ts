import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { BranchesService } from '../src/branches/branches.service.js';
import { CatalogService } from '../src/catalog/catalog.service.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RealtimeGateway } from '../src/realtime/realtime.gateway.js';
import { TablesService } from '../src/tables/tables.service.js';

// El inventario se descuenta cuando la comanda entra a cocina (al crear el
// pedido), una sola vez aunque el mesero reintente o la caja cobre después.
// DECISIÓN DE PROTOTIPO: de integración contra la base real, como
// rls-aislamiento.spec.ts, con datos propios que se borran al final.
// Correr con: docker compose run --rm backend-1 npx vitest run test/inventario-al-pedir.spec.ts
const sufijo = Date.now().toString(36);
const duenio = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const realtime = { emitirComandaNueva: vi.fn(), emitirInventarioActualizado: vi.fn() };

let orders: OrdersService;
let inventory: InventoryService;
let prisma: PrismaService;
let cadenaId: string;
let sedeId: string;
let usuarioId: string;
let productoId: string;
let carneId: string;
let panId: string;

const salidas = (pedidoId: string) =>
  duenio.movimientoInventario.findMany({ where: { pedidoId, tipo: 'SALIDA' }, orderBy: { insumoId: 'asc' } });

beforeAll(async () => {
  cadenaId = (await duenio.cadena.create({ data: { nit: `inv-${sufijo}`, nombre: 'Inventario test', plan: 'BASICO' } })).id;
  sedeId = (
    await duenio.sede.create({
      data: { cadenaId, nombre: 'Sede test', direccion: 'x', rangoInicio: 1, rangoFin: 100, siguienteConsecutivo: 1 },
    })
  ).id;
  usuarioId = (
    await duenio.usuario.create({ data: { cadenaId, rol: 'MESERO', email: `mesero-${sufijo}@test.local`, passwordHash: 'x' } })
  ).id;
  productoId = (await duenio.producto.create({ data: { cadenaId, nombre: 'Hamburguesa', precio: 18000, categoria: 'Platos' } })).id;
  carneId = (await duenio.insumo.create({ data: { cadenaId, nombre: 'Carne', unidad: 'gramos', costoUnitario: 25 } })).id;
  panId = (await duenio.insumo.create({ data: { cadenaId, nombre: 'Pan', unidad: 'unidad', costoUnitario: 800 } })).id;
  await duenio.receta.createMany({
    data: [
      { productoId, insumoId: carneId, cantidad: 150 },
      { productoId, insumoId: panId, cantidad: 1 },
    ],
  });

  const modulo = await Test.createTestingModule({
    providers: [
      PrismaService,
      OrdersService,
      InventoryService,
      BranchesService,
      CatalogService,
      TablesService,
      { provide: RealtimeGateway, useValue: realtime },
    ],
  }).compile();
  await modulo.init();
  orders = modulo.get(OrdersService);
  inventory = modulo.get(InventoryService);
  prisma = modulo.get(PrismaService);
});

afterAll(async () => {
  await duenio.movimientoInventario.deleteMany({ where: { sedeId } });
  await duenio.pedidoDetalle.deleteMany({ where: { pedido: { sedeId } } });
  await duenio.pedido.deleteMany({ where: { sedeId } });
  await duenio.receta.deleteMany({ where: { productoId } });
  await duenio.insumo.deleteMany({ where: { cadenaId } });
  await duenio.producto.deleteMany({ where: { cadenaId } });
  await duenio.usuario.deleteMany({ where: { cadenaId } });
  await duenio.sede.deleteMany({ where: { cadenaId } });
  await duenio.cadena.deleteMany({ where: { id: cadenaId } });
  await prisma?.onModuleDestroy();
  await duenio.$disconnect();
});

describe('descuento de inventario al pedir', () => {
  it('al crear el pedido descuenta la receta × cantidad y avisa a /inventario', async () => {
    const id = randomUUID();
    await orders.crear({ id, sedeId, detalles: [{ productoId, cantidad: 2 }] }, usuarioId, cadenaId);

    const movimientos = await salidas(id);
    const porInsumo = Object.fromEntries(movimientos.map((m) => [m.insumoId, m.cantidad.toString()]));
    expect(porInsumo).toEqual({ [carneId]: '300', [panId]: '2' });
    expect(realtime.emitirInventarioActualizado).toHaveBeenCalledWith(cadenaId, { sedeId, pedidoId: id });
  });

  it('reenviar el mismo pedido (reintento u offline) no descuenta otra vez', async () => {
    const id = randomUUID();
    const dto = { id, sedeId, detalles: [{ productoId, cantidad: 1 }] };
    await orders.crear(dto, usuarioId, cadenaId);
    const reenvio = await orders.crearConResultado(dto, usuarioId, cadenaId);

    expect(reenvio.duplicado).toBe(true);
    expect(await salidas(id)).toHaveLength(2);
  });

  it('al cobrar, un pedido que ya descontó no vuelve a descontar', async () => {
    const id = randomUUID();
    const pedido = await orders.crear({ id, sedeId, detalles: [{ productoId, cantidad: 1 }] }, usuarioId, cadenaId);

    const descontoAlCobrar = await prisma.conCadena(cadenaId, (tx) => inventory.descontarSiFalta(tx, pedido));

    expect(descontoAlCobrar).toBe(false);
    expect(await salidas(id)).toHaveLength(2);
  });

  it('un pedido anterior al cambio (sin SALIDA) descuenta al cobrarse, una sola vez', async () => {
    // Simula un pedido que entró a cocina cuando el descuento era al cobrar.
    const viejo = await duenio.pedido.create({
      data: {
        sedeId,
        usuarioId,
        estado: 'LISTO',
        total: 18000,
        detalles: { create: [{ productoId, cantidad: 1, precioUnitario: 18000 }] },
      },
      include: { detalles: true },
    });

    const primera = await prisma.conCadena(cadenaId, (tx) => inventory.descontarSiFalta(tx, viejo));
    const segunda = await prisma.conCadena(cadenaId, (tx) => inventory.descontarSiFalta(tx, viejo));

    expect([primera, segunda]).toEqual([true, false]);
    expect(await salidas(viejo.id)).toHaveLength(2);
  });
});
