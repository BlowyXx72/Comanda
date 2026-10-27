import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { verificarSedeDelUsuario } from '../auth/sede-usuario.js';
import { ColaFiscalService } from '../fiscal/cola-fiscal.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import type { CrearPagoDto } from './dto/crear-pago.dto.js';
import type { PagoOfflineDto } from './dto/pago-offline.dto.js';
import type { ReservarRangoDto } from './dto/reservar-rango.dto.js';

type PedidoCobrable = Awaited<ReturnType<OrdersService['obtener']>>;

// Fase 16: tamaño del bloque si la caja no pide uno (ver ReservarRangoDto).
const CANTIDAD_RANGO_DEFAULT = 20;

// Consumido por PaymentsController (POST /pagos), a su vez usado por caja al
// cobrar una mesa, y por SyncService (POST /sync) para los cobros hechos sin
// conexión (Fase 16, CU-07). Cierra el ciclo del pedido: registra el pago,
// genera el documento fiscal simulado con consecutivo por sede, marca el
// pedido como PAGADO y libera la mesa — todo en una sola transacción. El
// inventario se descuenta antes, al crear el pedido (ver OrdersService).
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly inventoryService: InventoryService,
    private readonly colaFiscal: ColaFiscalService,
  ) {}

  // `sedeUsuario`: sede asignada a quien cobra (Fase 17); null = cualquiera
  // de la cadena.
  async pagar(dto: CrearPagoDto, cadenaId: string, sedeUsuario: string | null = null) {
    const pedido = await this.pedidoCobrable(dto.pedidoId, dto.monto, cadenaId, sedeUsuario);

    const resultado = await this.prisma.conCadena(cadenaId, async (tx) => {
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

      return this.registrarCobro(tx, pedido, { medio: dto.medio, monto: new Prisma.Decimal(dto.monto) }, consecutivo);
    });

    this.despuesDelCobro(resultado, cadenaId);
    const { inventarioDescontado: _interno, ...respuesta } = resultado;
    return respuesta;
  }

  // Fase 16 (§6.3, CU-07): POST /pagos/rangos-offline. Reserva para una caja
  // un bloque de consecutivos del rango de la sede con el mismo UPDATE
  // atómico de pagar(), pero avanzando `cantidad` de una vez: los números del
  // bloque ya no los puede tomar ningún cobro en línea ni otra caja.
  async reservarRango(dto: ReservarRangoDto, cadenaId: string, sedeUsuario: string | null = null) {
    verificarSedeDelUsuario({ sedeId: sedeUsuario }, dto.sedeId);
    const cantidad = dto.cantidad ?? CANTIDAD_RANGO_DEFAULT;

    return this.prisma.conCadena(cadenaId, async (tx) => {
      const sede = await tx.sede.findFirst({ where: { id: dto.sedeId, cadenaId } });
      if (!sede) {
        throw new NotFoundException(`Sede ${dto.sedeId} no encontrada`);
      }

      const actualizada = await tx.sede.update({
        where: { id: sede.id },
        data: { siguienteConsecutivo: { increment: cantidad } },
      });
      const inicio = actualizada.siguienteConsecutivo - cantidad;
      if (inicio > actualizada.rangoFin) {
        throw new ConflictException(
          `La sede agotó su rango de numeración fiscal (${actualizada.rangoInicio}-${actualizada.rangoFin})`,
        );
      }

      // Si quedaban menos números que los pedidos, se entrega lo que queda y
      // el contador se deja justo después del final del rango.
      const fin = Math.min(actualizada.siguienteConsecutivo - 1, actualizada.rangoFin);
      if (fin < actualizada.siguienteConsecutivo - 1) {
        await tx.sede.update({ where: { id: sede.id }, data: { siguienteConsecutivo: fin + 1 } });
      }

      return tx.rangoDispositivo.create({
        data: { sedeId: sede.id, dispositivoId: dto.dispositivoId, inicio, fin },
      });
    });
  }

  // Fase 16 (§6.3, CU-07): aplica un cobro que la caja hizo sin conexión.
  // Idempotente por el UUID del pago (un reintento devuelve duplicado), y el
  // consecutivo tiene que estar en un bloque que ese dispositivo reservó para
  // esa sede. Lo llama SyncService por cada elemento de `pagos`.
  async pagarSincronizado(
    dto: PagoOfflineDto,
    cadenaId: string,
    sedeUsuario: string | null = null,
  ): Promise<{ duplicado: boolean }> {
    if (await this.pagoYaAplicado(dto, cadenaId)) {
      return { duplicado: true };
    }

    const pedido = await this.pedidoCobrable(dto.pedidoId, dto.monto, cadenaId, sedeUsuario);

    // DECISIÓN DE PROTOTIPO: la hora del cobro es la de la caja, pero nunca
    // en el futuro (un reloj adelantado no puede mover ventas a mañana).
    const ahora = new Date();
    const fechaCaja = new Date(dto.fechaHora);
    const creadoEn = fechaCaja < ahora ? fechaCaja : ahora;

    let resultado: Awaited<ReturnType<PaymentsService['registrarCobro']>>;
    try {
      resultado = await this.prisma.conCadena(cadenaId, async (tx) => {
        const rango = await tx.rangoDispositivo.findFirst({
          where: {
            sedeId: pedido.sedeId,
            dispositivoId: dto.dispositivoId,
            inicio: { lte: dto.consecutivo },
            fin: { gte: dto.consecutivo },
          },
        });
        if (!rango) {
          throw new ConflictException(
            `El consecutivo ${dto.consecutivo} no está en un rango reservado por esta caja para la sede`,
          );
        }

        return this.registrarCobro(
          tx,
          pedido,
          { id: dto.id, medio: dto.medio, monto: new Prisma.Decimal(dto.monto), creadoEn },
          dto.consecutivo,
        );
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Un reintento simultáneo del mismo pago ganó la carrera.
        if (await this.pagoYaAplicado(dto, cadenaId)) return { duplicado: true };
        throw new ConflictException(`El consecutivo ${dto.consecutivo} ya se usó en esta sede`);
      }
      throw err;
    }

    this.despuesDelCobro(resultado, cadenaId);
    return { duplicado: false };
  }

  private async pagoYaAplicado(dto: PagoOfflineDto, cadenaId: string) {
    const existente = await this.prisma.conCadena(cadenaId, (tx) => tx.pago.findUnique({ where: { id: dto.id } }));
    if (!existente) return false;
    if (existente.pedidoId !== dto.pedidoId) {
      throw new ConflictException(`El pago ${dto.id} ya existe para otro pedido`);
    }
    return true;
  }

  private async pedidoCobrable(pedidoId: string, montoPagado: number, cadenaId: string, sedeUsuario: string | null) {
    const pedido = await this.ordersService.obtener(pedidoId, cadenaId);
    verificarSedeDelUsuario({ sedeId: sedeUsuario }, pedido.sedeId);

    if (pedido.estado !== 'LISTO') {
      throw new ConflictException(
        `El pedido debe estar LISTO para cobrarse (estado actual: ${pedido.estado})`,
      );
    }

    const monto = new Prisma.Decimal(montoPagado);
    if (!monto.equals(pedido.total)) {
      // DECISIÓN DE PROTOTIPO: no se soportan pagos parciales, propinas ni
      // descuentos en este slice — el monto debe cubrir el total exacto.
      throw new BadRequestException(`El monto (${monto}) no coincide con el total del pedido (${pedido.total})`);
    }
    return pedido;
  }

  // La parte del cobro común al cobro en línea y al sincronizado: todo dentro
  // de la transacción que abrió quien llama, con el consecutivo ya decidido.
  private async registrarCobro(
    tx: Prisma.TransactionClient,
    pedido: PedidoCobrable,
    pagoData: Omit<Prisma.PagoUncheckedCreateInput, 'pedidoId'>,
    consecutivo: number,
  ) {
    const pago = await tx.pago.create({ data: { ...pagoData, pedidoId: pedido.id } });

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

    // Fase 11 (§6.2): el inventario ya se descontó al crear el pedido
    // (OrdersService). Aquí solo se cubren los pedidos que entraron a
    // cocina antes de ese cambio y aún no tienen SALIDA; dentro de la misma
    // transacción, así que si algo falla se revierte todo. No bloquea el
    // cobro si queda negativo (DECISIÓN DE PROTOTIPO, Fase 11).
    const inventarioDescontado = await this.inventoryService.descontarSiFalta(tx, pedido);

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

    return { pago, documentoFiscal, pedido: pedidoActualizado, inventarioDescontado };
  }

  // Avisos por WebSocket y encolado fiscal, fuera de la transacción.
  private despuesDelCobro(resultado: Awaited<ReturnType<PaymentsService['registrarCobro']>>, cadenaId: string) {
    this.realtimeGateway.emitirPedidoActualizado(resultado.pedido.sedeId, resultado.pedido);
    this.realtimeGateway.emitirVentaRegistrada(cadenaId, {
      sedeId: resultado.pedido.sedeId,
      // Fase 13: /panel suma la venta con este payload sin re-consultar (la
      // réplica puede ir unos ms atrás); sedeNombre permite crear la fila
      // de una sede/canal que aún no aparecía en el reporte.
      sedeNombre: resultado.pedido.sede.nombre,
      pedidoId: resultado.pedido.id,
      canal: resultado.pedido.canal,
      total: resultado.pedido.total,
      fechaHora: resultado.pago.creadoEn,
    });

    // Solo si este cobro descontó (pedido anterior al descuento al pedir);
    // lo normal es que el aviso ya haya salido al crear el pedido.
    if (resultado.inventarioDescontado) {
      this.realtimeGateway.emitirInventarioActualizado(cadenaId, {
        sedeId: resultado.pedido.sedeId,
        pedidoId: resultado.pedido.id,
      });
    }

    // Fase 11B (§5.1): la validación DIAN va por la cola, fuera de la
    // transacción y sin esperarla, ni siquiera el encolado: con Redis caído,
    // BullMQ reintenta la conexión y la caja quedaría colgada. Si encolar
    // falla, el cobro ya quedó confirmado: el documento sigue PENDIENTE y el
    // worker lo re-encola al arrancar.
    void this.colaFiscal
      .encolar({ documentoFiscalId: resultado.documentoFiscal.id, cadenaId })
      .catch((err: Error) => this.logger.error(`No se pudo encolar el documento fiscal: ${err.message}`));
  }
}
