import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { conexionRedis } from '../queue/conexion-redis.js';
import { COLA_ACUSES, type TrabajoAcuse } from './integraciones.types.js';

// DECISIÓN DE PROTOTIPO: mismos reintentos que la cola fiscal (backoff
// exponencial desde 2 s). La propuesta pide que la comunicación con la
// plataforma vaya por el worker (§5.1), no cuántas veces reintentar.
const INTENTOS = Number(process.env.COLA_PLATAFORMAS_INTENTOS ?? 5);

// Consumido por: IntegracionesService, después de crear (o reconocer como
// duplicado) un pedido de plataforma.
@Injectable()
export class ColaAcusesService implements OnModuleDestroy {
  private readonly logger = new Logger(ColaAcusesService.name);
  private readonly cola = new Queue<TrabajoAcuse>(COLA_ACUSES, { connection: conexionRedis() });

  async encolar(trabajo: TrabajoAcuse) {
    // jobId = id del pedido: si la plataforma reenvía el mismo pedido, el
    // acuse no se manda dos veces.
    await this.cola.add('acuse', trabajo, {
      jobId: trabajo.pedidoId,
      attempts: INTENTOS,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 24 * 3600 },
    });
    this.logger.log(`Acuse del pedido ${trabajo.pedidoId} encolado`);
  }

  async onModuleDestroy() {
    await this.cola.close();
  }
}
