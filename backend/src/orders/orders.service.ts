import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BranchesService } from '../branches/branches.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { EstadoPedido } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TablesService } from '../tables/tables.service.js';
import type { CreatePedidoDto } from './dto/create-pedido.dto.js';

// Solo se avanza un estado a la vez, en este orden; PAGADO no se alcanza
// por PATCH (ver actualizar-estado-pedido.dto.ts).
const ORDEN_ESTADOS: EstadoPedido[] = ['ABIERTO', 'EN_PREPARACION', 'LISTO', 'PAGADO'];

const INCLUDE_PEDIDO = {
  sede: true,
  mesa: true,
  detalles: { include: { producto: true } },
} satisfies Prisma.PedidoInclude;

// Consumido por OrdersController (POST/GET/PATCH /pedidos), a su vez usado
// por mesero (crear), cocina (marcar LISTO) y caja (consultar antes de cobrar).
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchesService: BranchesService,
    private readonly catalogService: CatalogService,
    private readonly tablesService: TablesService,
  ) {}

  async crear(dto: CreatePedidoDto, usuarioId: string, cadenaId: string) {
    // Idempotencia: el UUID lo generó el cliente, así que un reintento
    // (p. ej. tras perder la respuesta por la red) no debe duplicar el pedido.
    const existente = await this.prisma.pedido.findUnique({ where: { id: dto.id }, include: INCLUDE_PEDIDO });
    if (existente) {
      return existente;
    }

    await this.branchesService.obtenerDeCadena(dto.sedeId, cadenaId);

    const productos = await Promise.all(
      dto.detalles.map((detalle) => this.catalogService.obtenerDeCadena(detalle.productoId, cadenaId)),
    );

    let total = new Prisma.Decimal(0);
    const detallesData = dto.detalles.map((detalle, i) => {
      const producto = productos[i];
      total = total.plus(producto.precio.times(detalle.cantidad));
      return {
        productoId: producto.id,
        cantidad: detalle.cantidad,
        precioUnitario: producto.precio,
        notas: detalle.notas,
      };
    });

    if (dto.mesaId) {
      await this.tablesService.ocupar(dto.mesaId, dto.sedeId);
    }

    return this.prisma.pedido.create({
      data: {
        id: dto.id,
        sedeId: dto.sedeId,
        mesaId: dto.mesaId,
        usuarioId,
        // DECISIÓN DE PROTOTIPO: "armar y enviar comanda" es una sola acción
        // del mesero, así que el pedido nace directo en EN_PREPARACION en
        // vez de pasar por un ABIERTO intermedio que ningún endpoint usaría.
        estado: 'EN_PREPARACION',
        total,
        detalles: { create: detallesData },
      },
      include: INCLUDE_PEDIDO,
    });
  }

  async obtener(id: string, cadenaId: string) {
    const pedido = await this.prisma.pedido.findUnique({ where: { id }, include: INCLUDE_PEDIDO });
    if (!pedido || pedido.sede.cadenaId !== cadenaId) {
      throw new NotFoundException(`Pedido ${id} no encontrado`);
    }
    return pedido;
  }

  async actualizarEstado(id: string, nuevoEstado: EstadoPedido, cadenaId: string) {
    const pedido = await this.obtener(id, cadenaId);

    const idxActual = ORDEN_ESTADOS.indexOf(pedido.estado);
    const idxNuevo = ORDEN_ESTADOS.indexOf(nuevoEstado);
    if (idxNuevo !== idxActual + 1) {
      throw new ConflictException(`No se puede pasar de ${pedido.estado} a ${nuevoEstado}`);
    }

    return this.prisma.pedido.update({
      where: { id },
      data: { estado: nuevoEstado },
      include: INCLUDE_PEDIDO,
    });
  }
}
