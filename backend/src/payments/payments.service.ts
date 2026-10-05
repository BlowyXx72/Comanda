import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ColaFiscalService } from '../fiscal/cola-fiscal.service.js';
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
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly colaFiscal: ColaFiscalService,
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
      // Fase 8: el consecutivo sale de un UPDATE atómico sobre la sede
      // (`siguiente_consecutivo = siguiente_consecutivo + 1 RETURNING ...`),
      // no de un MAX+1. Postgres toma el lock de fila en el UPDATE, así que
      // dos cajas cobrando a la vez en la misma sede quedan serializadas: la
      // segunda espera a que la primera confirme (o revierta) antes de leer
      // el valor. Ya no hace falta una secuencia ni un lock explícito aparte.
      const sedeActualizada = await tx.sede.update({
        where: { id: pedido.sedeId },
        data: { siguienteConsecutivo: { increment: 1 } },
      });
      const consecutivo = sedeActualizada.siguienteConsecutivo - 1;

      if (consecutivo > sedeActualizada.rangoFin) {
        // Lanzar dentro de la transacción la revierte por completo, así que
        // el incremento de arriba también se deshace: un rango agotado no
        // sigue avanzando el contador en cada intento fallido.
        throw new ConflictException(
          `La sede agotó su rango de numeración fiscal (${sedeActualizada.rangoInicio}-${sedeActualizada.rangoFin})`,
        );
      }

      const pago = await tx.pago.create({
        data: { pedidoId: pedido.id, medio: dto.medio, monto },
      });

      const documentoFiscal = await tx.documentoFiscal.create({
        data: {
          pedidoId: pedido.id,
          sedeId: pedido.sedeId,
          tipo: 'FACTURA',
          consecutivo,
          // Fase 11B: queda PENDIENTE y el worker lo valida en segundo plano
          // contra el proveedor DIAN simulado (ver FiscalModule).
          // TODO PRODUCCION: proveedor tecnológico DIAN real.
          estadoDian: 'PENDIENTE',
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
    this.realtimeGateway.emitirVentaRegistrada(cadenaId, {
      sedeId: resultado.pedido.sedeId,
      pedidoId: resultado.pedido.id,
      canal: resultado.pedido.canal,
      total: resultado.pedido.total,
      fechaHora: resultado.pago.creadoEn,
    });

    // Fase 11B (§5.1): la validación DIAN va por la cola, fuera de la
    // transacción y sin esperarla, ni siquiera el encolado: con Redis caído,
    // BullMQ reintenta la conexión y la caja quedaría colgada. Si encolar
    // falla, el cobro ya quedó confirmado: el documento sigue PENDIENTE y el
    // worker lo re-encola al arrancar.
    void this.colaFiscal
      .encolar({ documentoFiscalId: resultado.documentoFiscal.id, cadenaId })
      .catch((err: Error) => this.logger.error(`No se pudo encolar el documento fiscal: ${err.message}`));
    return resultado;
  }
}
