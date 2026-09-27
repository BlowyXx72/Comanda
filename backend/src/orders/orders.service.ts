import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BranchesService } from '../branches/branches.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { EstadoPedido } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { TablesService } from '../tables/tables.service.js';
import type { CreatePedidoDetalleDto } from './dto/create-pedido-detalle.dto.js';
import type { CreatePedidoDomicilioDto } from './dto/create-pedido-domicilio.dto.js';
import type { CreatePedidoDto } from './dto/create-pedido.dto.js';

// Órdenes que le interesan al KDS al abrir /cocina (ver GET /pedidos?sedeId=).
const ESTADOS_ACTIVOS: EstadoPedido[] = ['EN_PREPARACION', 'LISTO'];

// Solo se avanza un estado a la vez, en este orden; PAGADO no se alcanza
// por PATCH (ver actualizar-estado-pedido.dto.ts).
const ORDEN_ESTADOS: EstadoPedido[] = ['ABIERTO', 'EN_PREPARACION', 'LISTO', 'PAGADO'];

const INCLUDE_PEDIDO = {
  sede: true,
  mesa: true,
  cliente: true,
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
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  // Consumido por: /cocina al montar, para hidratar el tablero antes de que
  // empiecen a llegar eventos `comanda:nueva`/`pedido:actualizado` en vivo.
  async listarActivos(sedeId: string, cadenaId: string) {
    await this.branchesService.obtenerDeCadena(sedeId, cadenaId);
    return this.prisma.pedido.findMany({
      where: { sedeId, estado: { in: ESTADOS_ACTIVOS } },
      include: INCLUDE_PEDIDO,
      orderBy: { fechaHora: 'asc' },
    });
  }

  async crear(dto: CreatePedidoDto, usuarioId: string, cadenaId: string) {
    const { pedido } = await this.crearConResultado(dto, usuarioId, cadenaId);
    return pedido;
  }

  // Igual que crear(), pero avisa si el pedido ya existía. Lo usa POST /sync
  // (SyncModule) para reportar duplicados al vaciar la cola offline (CU-07).
  async crearConResultado(dto: CreatePedidoDto, usuarioId: string, cadenaId: string) {
    // Idempotencia: el UUID lo generó el cliente, así que un reintento
    // (p. ej. tras perder la respuesta por la red) no debe duplicar el pedido.
    const existente = await this.prisma.pedido.findUnique({ where: { id: dto.id }, include: INCLUDE_PEDIDO });
    if (existente) {
      // Un UUID de otra cadena no se confirma ni se devuelve.
      if (existente.sede.cadenaId !== cadenaId) {
        throw new NotFoundException(`Pedido ${dto.id} no encontrado`);
      }
      return { pedido: existente, duplicado: true };
    }

    await this.branchesService.obtenerDeCadena(dto.sedeId, cadenaId);
    const { total, detallesData } = await this.armarDetalles(dto.detalles, cadenaId);

    if (dto.mesaId) {
      await this.tablesService.ocupar(dto.mesaId, dto.sedeId);
    }

    const pedido = await this.prisma.pedido.create({
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

    this.realtimeGateway.emitirComandaNueva(dto.sedeId, pedido);
    return { pedido, duplicado: false };
  }

  // Pedido de domicilio web (CU-04): sin mesa ni usuario interno, con un
  // Cliente. Llega a cocina por el mismo evento `comanda:nueva` que un pedido
  // de salón.
  async crearDomicilio(dto: CreatePedidoDomicilioDto) {
    const existente = await this.prisma.pedido.findUnique({ where: { id: dto.id }, include: INCLUDE_PEDIDO });
    if (existente) {
      return existente;
    }

    await this.branchesService.obtenerDeCadena(dto.sedeId, dto.cadenaId);
    const { total, detallesData } = await this.armarDetalles(dto.detalles, dto.cadenaId);

    const pedido = await this.prisma.pedido.create({
      data: {
        id: dto.id,
        sede: { connect: { id: dto.sedeId } },
        canal: 'DOMICILIO',
        // Mismo criterio que crear(): nace directo en EN_PREPARACION.
        estado: 'EN_PREPARACION',
        total,
        // DECISIÓN DE PROTOTIPO: se crea un Cliente nuevo por pedido en vez de
        // buscarlo por teléfono; no hay cuentas de cliente ni historial en
        // este prototipo, así que deduplicarlos no aporta nada todavía.
        cliente: { create: { cadena: { connect: { id: dto.cadenaId } }, ...dto.cliente } },
        detalles: { create: detallesData },
      },
      include: INCLUDE_PEDIDO,
    });

    this.realtimeGateway.emitirComandaNueva(dto.sedeId, pedido);
    return pedido;
  }

  // Valida que cada producto sea de la cadena y congela su precio vigente en
  // el detalle. Compartido por los pedidos de salón y de domicilio.
  private async armarDetalles(detalles: CreatePedidoDetalleDto[], cadenaId: string) {
    const productos = await Promise.all(
      detalles.map((detalle) => this.catalogService.obtenerDeCadena(detalle.productoId, cadenaId)),
    );

    // Fase 10: GET /productos ya no lista los desactivados, pero un cliente
    // con el catálogo desactualizado (o alguien pegándole directo a la API)
    // podría seguir mandando un productoId que se dio de baja mientras tanto.
    // Aplica igual a pedidos en mesa, domicilio y los que llegan por /sync.
    const inactivo = productos.find((producto) => !producto.activo);
    if (inactivo) {
      throw new ConflictException(`El producto "${inactivo.nombre}" ya no está disponible`);
    }

    let total = new Prisma.Decimal(0);
    const detallesData = detalles.map((detalle, i) => {
      const producto = productos[i];
      total = total.plus(producto.precio.times(detalle.cantidad));
      return {
        productoId: producto.id,
        cantidad: detalle.cantidad,
        precioUnitario: producto.precio,
        notas: detalle.notas,
      };
    });

    return { total, detallesData };
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

    const actualizado = await this.prisma.pedido.update({
      where: { id },
      data: { estado: nuevoEstado },
      include: INCLUDE_PEDIDO,
    });

    this.realtimeGateway.emitirPedidoActualizado(actualizado.sedeId, actualizado);
    return actualizado;
  }
}
