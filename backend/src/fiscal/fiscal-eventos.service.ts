import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { QueueEvents } from 'bullmq';
import { conexionRedis } from '../queue/conexion-redis.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { COLA_FISCAL, type ResultadoFiscal } from './fiscal.types.js';

// El worker corre en otro proceso y no tiene los sockets de los navegadores.
// Este servicio, dentro del backend, escucha los eventos de la cola en Redis
// y reenvía cada resultado como `documento:actualizado` a la sede.
// TODO 13B: con dos instancias de backend, ambas escucharían el mismo evento
// y, con el backplane de Redis, cada caja lo recibiría dos veces. Ahí hay que
// dejar un solo emisor o deduplicar en el cliente por documentoFiscalId.
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
