import { Injectable, NotFoundException } from '@nestjs/common';
import { BranchesService } from '../branches/branches.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import type { ActualizarInsumoDto } from './dto/actualizar-insumo.dto.js';
import type { ActualizarRecetaDto } from './dto/actualizar-receta.dto.js';
import type { CrearInsumoDto } from './dto/crear-insumo.dto.js';
import type { CrearMovimientoDto } from './dto/crear-movimiento.dto.js';

// Consumido por: InsumosController, RecetasController, InventoryController
// (GET /sedes/:id/inventario, POST /inventario/movimientos) y PaymentsService
// (descuento automático de inventario al cobrar, Fase 11, §6.2).
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchesService: BranchesService,
    private readonly catalogService: CatalogService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  listarInsumos(cadenaId: string) {
    return this.prisma.conCadena(cadenaId, (tx) =>
      tx.insumo.findMany({ where: { cadenaId }, orderBy: { nombre: 'asc' } }),
    );
  }

  async obtenerInsumoDeCadena(insumoId: string, cadenaId: string) {
    const insumo = await this.prisma.conCadena(cadenaId, (tx) =>
      tx.insumo.findUnique({ where: { id: insumoId } }),
    );
    if (!insumo || insumo.cadenaId !== cadenaId) {
      throw new NotFoundException(`Insumo ${insumoId} no encontrado`);
    }
    return insumo;
  }

  crearInsumo(cadenaId: string, dto: CrearInsumoDto) {
    return this.prisma.conCadena(cadenaId, (tx) => tx.insumo.create({ data: { cadenaId, ...dto } }));
  }

  async actualizarInsumo(id: string, cadenaId: string, dto: ActualizarInsumoDto) {
    await this.obtenerInsumoDeCadena(id, cadenaId);
    return this.prisma.conCadena(cadenaId, (tx) => tx.insumo.update({ where: { id }, data: dto }));
  }

  // Fase 11: no hay columna de stock — la existencia de un insumo en una
  // sede es la suma de sus movimientos (ENTRADA suma, SALIDA y MERMA
  // restan). DECISIÓN DE PROTOTIPO: puede quedar negativa (no se bloquea la
  // venta cuando se agota un insumo, ver docs/fases-siguientes-2.md Fase 11).
  async existenciasPorSede(sedeId: string, cadenaId: string) {
    await this.branchesService.obtenerDeCadena(sedeId, cadenaId);

    const [insumos, movimientos] = await Promise.all([
      this.listarInsumos(cadenaId),
      this.prisma.conCadena(cadenaId, (tx) => tx.movimientoInventario.findMany({ where: { sedeId } })),
    ]);

    const existenciaPorInsumo = new Map<string, Prisma.Decimal>();
    for (const movimiento of movimientos) {
      const signo = movimiento.tipo === 'ENTRADA' ? 1 : -1;
      const actual = existenciaPorInsumo.get(movimiento.insumoId) ?? new Prisma.Decimal(0);
      existenciaPorInsumo.set(movimiento.insumoId, actual.plus(movimiento.cantidad.times(signo)));
    }

    return insumos.map((insumo) => ({
      ...insumo,
      existencia: existenciaPorInsumo.get(insumo.id) ?? new Prisma.Decimal(0),
    }));
  }

  async registrarMovimiento(dto: CrearMovimientoDto, cadenaId: string) {
    await this.branchesService.obtenerDeCadena(dto.sedeId, cadenaId);
    await this.obtenerInsumoDeCadena(dto.insumoId, cadenaId);
    const movimiento = await this.prisma.conCadena(cadenaId, (tx) =>
      tx.movimientoInventario.create({
        data: { sedeId: dto.sedeId, insumoId: dto.insumoId, tipo: dto.tipo, cantidad: dto.cantidad },
      }),
    );
    this.realtimeGateway.emitirInventarioActualizado(cadenaId, {
      sedeId: dto.sedeId,
      insumoId: dto.insumoId,
      tipo: dto.tipo,
      cantidad: dto.cantidad,
    });
    return movimiento;
  }

  async listarReceta(productoId: string, cadenaId: string) {
    await this.catalogService.obtenerDeCadena(productoId, cadenaId);
    return this.prisma.conCadena(cadenaId, (tx) =>
      tx.receta.findMany({
        where: { productoId },
        include: { insumo: true },
        orderBy: { insumo: { nombre: 'asc' } },
      }),
    );
  }

  // PUT: reemplaza la receta completa del producto (CRUD mínimo, ver
  // docs/fases-siguientes-2.md Fase 11 — más simple que exponer un
  // POST/DELETE por insumo).
  async reemplazarReceta(productoId: string, cadenaId: string, dto: ActualizarRecetaDto) {
    await this.catalogService.obtenerDeCadena(productoId, cadenaId);

    const insumoIds = dto.items.map((item) => item.insumoId);
    const insumos = await this.prisma.conCadena(cadenaId, (tx) =>
      tx.insumo.findMany({ where: { id: { in: insumoIds }, cadenaId } }),
    );
    if (insumos.length !== new Set(insumoIds).size) {
      throw new NotFoundException('Uno o más insumos no existen en esta cadena');
    }

    return this.prisma.conCadena(cadenaId, async (tx) => {
      await tx.receta.deleteMany({ where: { productoId } });
      if (dto.items.length === 0) return [];
      await tx.receta.createMany({
        data: dto.items.map((item) => ({ productoId, insumoId: item.insumoId, cantidad: item.cantidad })),
      });
      return tx.receta.findMany({ where: { productoId }, include: { insumo: true } });
    });
  }

  // Llamado por PaymentsService.pagar, dentro de la misma transacción del
  // cobro: un SALIDA por cada insumo de la receta de cada detalle del
  // pedido. Si un producto no tiene receta definida, simplemente no genera
  // movimientos (no todos los productos demo la necesitan).
  async descontarPorVenta(
    tx: Prisma.TransactionClient,
    sedeId: string,
    detalles: { productoId: string; cantidad: number }[],
  ) {
    const productoIds = [...new Set(detalles.map((detalle) => detalle.productoId))];
    const recetas = await tx.receta.findMany({ where: { productoId: { in: productoIds } } });
    if (recetas.length === 0) return;

    const movimientos = detalles.flatMap((detalle) =>
      recetas
        .filter((receta) => receta.productoId === detalle.productoId)
        .map((receta) => ({
          sedeId,
          insumoId: receta.insumoId,
          tipo: 'SALIDA' as const,
          cantidad: receta.cantidad.times(detalle.cantidad),
        })),
    );
    if (movimientos.length > 0) {
      await tx.movimientoInventario.createMany({ data: movimientos });
    }
  }
}
