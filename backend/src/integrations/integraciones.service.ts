import { Injectable, Logger } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ColaAcusesService } from './cola-acuses.service.js';
import type { PedidoPlataformaDto } from './dto/pedido-plataforma.dto.js';
import type { IntegracionAutenticada } from './integraciones.types.js';

// Traduce los pedidos de una plataforma de domicilios (CU-05) a pedidos de
// Comanda, sin re-digitación, y encola el acuse de vuelta.
// Consumido por: IntegracionesController.
@Injectable()
export class IntegracionesService {
  private readonly logger = new Logger(IntegracionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly colaAcuses: ColaAcusesService,
  ) {}

  async recibirPedido(dto: PedidoPlataformaDto, integracion: IntegracionAutenticada) {
    const { pedido, duplicado } = await this.ordersService.crearPlataforma({
      integracionId: integracion.id,
      cadenaId: integracion.cadenaId,
      referenciaExterna: dto.orderId,
      sedeId: dto.storeId,
      cliente: { nombre: dto.customer.name, telefono: dto.customer.phone, direccion: dto.customer.address },
      detalles: dto.items.map((item) => ({ productoId: item.sku, cantidad: item.qty, notas: item.comment })),
    });

    // §5.1: la comunicación de vuelta con la plataforma sale por el worker.
    // También en un duplicado: si la primera vez no se alcanzó a encolar, el
    // reenvío de la plataforma lo repara, y el jobId fijo evita un segundo
    // acuse si ya estaba en la cola. Sin esperar, igual que el encolado
    // fiscal en PaymentsService: el pedido ya está en cocina.
    void this.colaAcuses
      .encolar({ pedidoId: pedido.id, cadenaId: integracion.cadenaId, integracionId: integracion.id })
      .catch((err: Error) => this.logger.error(`No se pudo encolar el acuse del pedido ${pedido.id}: ${err.message}`));

    // A la plataforma solo se le confirma lo suyo, en su formato.
    return {
      orderId: dto.orderId,
      externalId: pedido.id,
      status: pedido.estado,
      total: pedido.total.toString(),
      duplicate: duplicado,
    };
  }

  // Lo que la plataforma necesita para armar su menú: sedes y productos
  // activos de la cadena de la API key.
  async catalogo(integracion: IntegracionAutenticada) {
    const [sedes, productos] = await Promise.all([
      this.prisma.sede.findMany({
        where: { cadenaId: integracion.cadenaId },
        select: { id: true, nombre: true, direccion: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.producto.findMany({
        // Igual que el menú público: los dados de baja no se publican.
        where: { cadenaId: integracion.cadenaId, activo: true },
        select: { id: true, nombre: true, precio: true, categoria: true },
        orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
      }),
    ]);
    return {
      plataforma: integracion.nombre,
      sedes,
      productos: productos.map((p) => ({ ...p, precio: p.precio.toString() })),
    };
  }
}
