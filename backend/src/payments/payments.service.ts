import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { OrdersService } from '../orders/orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import type { CrearPagoDto } from './dto/crear-pago.dto.js';

// Consumido por PaymentsController (POST /pagos), a su vez usado por caja al
// cobrar una mesa. Cierra el ciclo del pedido: registra el pago, genera el
// documento fiscal simulado con consecutivo por sede, marca el pedido como
// PAGADO y libera la mesa — todo en una sola transacción.
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async pagar(dto: CrearPagoDto, cadenaId: string) {
    const pedido = await this.ordersService.obtener(dto.pedidoId, cadenaId);

    if (pedido.estado !== 'LISTO') {
      throw new ConflictException(
        `El pedido debe estar LISTO para cobrarse (estado actual: ${pedido.estado})`,
      );
    }

    const monto = new Prisma.Decimal(dto.monto);
    if (!monto.equals(pedido.total)) {
      // DECISIÓN DE PROTOTIPO: no se soportan pagos parciales, propinas ni
      // descuentos en este slice — el monto debe cubrir el total exacto.
      throw new BadRequestException(`El monto (${monto}) no coincide con el total del pedido (${pedido.total})`);
    }

    const resultado = await this.prisma.$transaction(async (tx) => {
      const pago = await tx.pago.create({
        data: { pedidoId: pedido.id, medio: dto.medio, monto },
      });

      // TODO PRODUCCION: MAX+1 dentro de la transacción alcanza para una
      // caja cobrando de a una mesa a la vez (el caso de esta demo); con
      // varias cajas concurrentes en la misma sede haría falta una secuencia
      // de base de datos o un lock explícito para no repetir consecutivo.
      const { _max } = await tx.documentoFiscal.aggregate({
        where: { sedeId: pedido.sedeId },
        _max: { consecutivo: true },
      });
      const consecutivo = (_max.consecutivo ?? 0) + 1;

      const documentoFiscal = await tx.documentoFiscal.create({
        data: {
          pedidoId: pedido.id,
          sedeId: pedido.sedeId,
          tipo: 'FACTURA',
          consecutivo,
          // TODO PRODUCCION: aquí iría la integración real con la DIAN
          // (generar y firmar el XML, radicarlo, guardar su estado real).
          estadoDian: 'SIMULADO',
        },
      });

      if (pedido.mesaId) {
        await tx.mesa.update({ where: { id: pedido.mesaId }, data: { estado: 'LIBRE' } });
      }

      // Se actualiza después de liberar la mesa para que el `include` refleje
      // el estado final (LIBRE) en el payload que se emite por WebSocket.
      const pedidoActualizado = await tx.pedido.update({
        where: { id: pedido.id },
        data: { estado: 'PAGADO' },
        include: { sede: true, mesa: true, detalles: { include: { producto: true } } },
      });

      return { pago, documentoFiscal, pedido: pedidoActualizado };
    });

    this.realtimeGateway.emitirPedidoActualizado(pedido.sedeId, resultado.pedido);
    return resultado;
  }
}
