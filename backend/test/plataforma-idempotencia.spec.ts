import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { BranchesService } from '../src/branches/branches.service.js';
import { CatalogService } from '../src/catalog/catalog.service.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashApiKey } from '../src/integrations/api-key.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { type DatosPedidoPlataforma, OrdersService } from '../src/orders/orders.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RealtimeGateway } from '../src/realtime/realtime.gateway.js';
import { TablesService } from '../src/tables/tables.service.js';

// Fase 15 (CU-05, Fase 12B): un reenvío de la plataforma con el mismo
// orderId no duplica el pedido, ni siquiera si llegan dos a la vez.
// DECISIÓN DE PROTOTIPO: igual que rls-aislamiento.spec.ts, es de
// integración contra la base real, con datos propios que se borran al final.
// Correr con: docker compose run --rm backend-1 npx vitest run test/plataforma-idempotencia.spec.ts
const sufijo = Date.now().toString(36);
const duenio = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const emitirComandaNueva = vi.fn();

let orders: OrdersService;
let prisma: PrismaService;
let cadenaId: string;
let sedeId: string;
let productoId: string;
let integracionId: string;

const datos = (referenciaExterna: string): DatosPedidoPlataforma => ({
  integracionId,
  cadenaId,
  referenciaExterna,
  sedeId,
  cliente: { nombre: 'Cliente plataforma', telefono: '3000000000', direccion: 'Calle 1' },
  detalles: [{ productoId, cantidad: 2 }],
});

beforeAll(async () => {
  cadenaId = (await duenio.cadena.create({ data: { nit: `plat-${sufijo}`, nombre: 'Plataforma test', plan: 'BASICO' } })).id;
  sedeId = (
    await duenio.sede.create({
      data: { cadenaId, nombre: 'Sede test', direccion: 'x', rangoInicio: 1, rangoFin: 100, siguienteConsecutivo: 1 },
    })
  ).id;
  productoId = (await duenio.producto.create({ data: { cadenaId, nombre: 'Arepa', precio: 8000, categoria: 'Platos' } })).id;
  integracionId = (
    await duenio.integracionPlataforma.create({
      data: { cadenaId, nombre: 'Simulador test', apiKeyHash: hashApiKey(`llave-${sufijo}`) },
    })
  ).id;

  const modulo = await Test.createTestingModule({
    providers: [
      PrismaService,
      OrdersService,
      InventoryService,
      BranchesService,
      CatalogService,
      TablesService,
      { provide: RealtimeGateway, useValue: { emitirComandaNueva, emitirInventarioActualizado: vi.fn() } },
    ],
  }).compile();
  await modulo.init();
  orders = modulo.get(OrdersService);
  prisma = modulo.get(PrismaService);
});

afterAll(async () => {
  const pedidos = { sedeId };
  await duenio.movimientoInventario.deleteMany({ where: { sedeId } });
  await duenio.pedidoDetalle.deleteMany({ where: { pedido: pedidos } });
  await duenio.pedido.deleteMany({ where: pedidos });
  await duenio.cliente.deleteMany({ where: { cadenaId } });
  await duenio.integracionPlataforma.deleteMany({ where: { cadenaId } });
  await duenio.producto.deleteMany({ where: { cadenaId } });
  await duenio.sede.deleteMany({ where: { cadenaId } });
  await duenio.cadena.deleteMany({ where: { id: cadenaId } });
  await prisma?.onModuleDestroy();
  await duenio.$disconnect();
});

describe('pedidos de plataforma: idempotencia por orderId', () => {
  it('el primer envío crea el pedido con el total del catálogo y avisa a cocina', async () => {
    const { pedido, duplicado } = await orders.crearPlataforma(datos('ORD-1'));

    expect(duplicado).toBe(false);
    expect(pedido.canal).toBe('PLATAFORMA');
    expect(pedido.estado).toBe('EN_PREPARACION');
    expect(pedido.total.toString()).toBe('16000');
    expect(emitirComandaNueva).toHaveBeenCalledTimes(1);
  });

  it('un reenvío con el mismo orderId devuelve el mismo pedido sin crear otro', async () => {
    const primero = await orders.crearPlataforma(datos('ORD-2'));
    emitirComandaNueva.mockClear();

    const reenvio = await orders.crearPlataforma(datos('ORD-2'));

    expect(reenvio.duplicado).toBe(true);
    expect(reenvio.pedido.id).toBe(primero.pedido.id);
    expect(emitirComandaNueva).not.toHaveBeenCalled();
    expect(await duenio.pedido.count({ where: { integracionId, referenciaExterna: 'ORD-2' } })).toBe(1);
  });

  it('dos envíos simultáneos con el mismo orderId dejan un solo pedido', async () => {
    const [a, b] = await Promise.all([orders.crearPlataforma(datos('ORD-3')), orders.crearPlataforma(datos('ORD-3'))]);

    expect(a.pedido.id).toBe(b.pedido.id);
    expect([a.duplicado, b.duplicado].sort()).toEqual([false, true]);
    expect(await duenio.pedido.count({ where: { integracionId, referenciaExterna: 'ORD-3' } })).toBe(1);
  });
});
