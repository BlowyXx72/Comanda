import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { conexionRedis } from '../queue/conexion-redis.js';
import { COLA_FISCAL, type TrabajoFiscal } from './fiscal.types.js';

// DECISIÓN DE PROTOTIPO: 5 intentos con backoff exponencial desde 2 s
// (2, 4, 8, 16 s). La propuesta pide que la caja no espere a la DIAN, no
// cuántas veces reintentar.
const INTENTOS = Number(process.env.COLA_FISCAL_INTENTOS ?? 5);

// Consumido por: PaymentsService (encola el documento recién cobrado) y el
// worker al arrancar (re-encola los que quedaron PENDIENTE).
@Injectable()
export class ColaFiscalService implements OnModuleDestroy {
  private readonly logger = new Logger(ColaFiscalService.name);
  private readonly cola = new Queue<TrabajoFiscal>(COLA_FISCAL, { connection: conexionRedis() });

  async encolar(trabajo: TrabajoFiscal) {
    // jobId = id del documento: encolar dos veces el mismo documento (p. ej.
    // el re-encolado al arrancar el worker) no crea un segundo trabajo.
    await this.cola.add('validar', trabajo, {
      jobId: trabajo.documentoFiscalId,
      attempts: INTENTOS,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 24 * 3600 },
    });
    this.logger.log(`Documento ${trabajo.documentoFiscalId} encolado para validación DIAN (simulada)`);
  }

  async onModuleDestroy() {
    await this.cola.close();
  }
}
