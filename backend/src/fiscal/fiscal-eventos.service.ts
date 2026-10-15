import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { QueueEvents } from 'bullmq';
import { conexionRedis } from '../queue/conexion-redis.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { COLA_FISCAL, type ResultadoFiscal } from './fiscal.types.js';

// El worker corre en otro proceso y no tiene los sockets de los navegadores.
// Este servicio, dentro del backend, escucha los eventos de la cola en Redis
// y reenvía cada resultado como `documento:actualizado` a la sede.
// Fase 13B: con dos instancias, las dos reciben el mismo evento `completed`.
// Por eso cada una lo emite solo a sus propios sockets (ver
// RealtimeGateway.emitirDocumentoActualizado) y cada caja lo recibe una vez.
@Injectable()
export class FiscalEventosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FiscalEventosService.name);
  private eventos?: QueueEvents;

  constructor(private readonly realtimeGateway: RealtimeGateway) {}

  onModuleInit() {
    this.eventos = new QueueEvents(COLA_FISCAL, { connection: conexionRedis() });
    this.eventos.on('completed', ({ returnvalue }) => {
      const resultado = (typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue) as ResultadoFiscal;
      if (!resultado?.sedeId) return;
      this.realtimeGateway.emitirDocumentoActualizado(resultado.sedeId, resultado);
      this.logger.log(`Documento ${resultado.documentoFiscalId}: ${resultado.estadoDian}`);
    });
  }

  async onModuleDestroy() {
    await this.eventos?.close();
  }
}
