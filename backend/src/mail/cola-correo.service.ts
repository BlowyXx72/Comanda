import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { conexionRedis } from '../queue/conexion-redis.js';
import { COLA_CORREO, type TrabajoCorreo } from './mail.types.js';

// DECISIÓN DE PROTOTIPO: mismos reintentos que las otras colas. La propuesta
// no fija cuántas veces reintentar un correo.
const INTENTOS = Number(process.env.COLA_CORREO_INTENTOS ?? 5);
const OPCIONES = {
  attempts: INTENTOS,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 24 * 3600 },
};

export const ZONA_RESUMEN = process.env.RESUMEN_DIARIO_ZONA ?? 'America/Bogota';
const CRON_RESUMEN = process.env.RESUMEN_DIARIO_CRON ?? '0 23 * * *';

// Consumido por: ProcesadorFiscalService (comprobante al validar un
// domicilio), MailController (resumen manual) y ProcesadorCorreoService
// (registra el resumen programado al arrancar el worker).
@Injectable()
export class ColaCorreoService implements OnModuleDestroy {
  private readonly logger = new Logger(ColaCorreoService.name);
  private readonly cola = new Queue<TrabajoCorreo>(COLA_CORREO, { connection: conexionRedis() });

  async encolarComprobante(documentoFiscalId: string, cadenaId: string) {
    // jobId fijo: un reintento del trabajo fiscal no manda dos comprobantes.
    await this.cola.add(
      'comprobante',
      { tipo: 'COMPROBANTE', documentoFiscalId, cadenaId },
      { ...OPCIONES, jobId: `comprobante-${documentoFiscalId}` },
    );
    this.logger.log(`Comprobante del documento ${documentoFiscalId} encolado`);
  }

  // Disparo manual (POST /correo/resumen-diario). Sin jobId fijo: el ADMIN
  // puede pedirlo las veces que quiera durante la demo.
  async encolarResumen(cadenaId: string, fecha?: string) {
    await this.cola.add('resumen-diario', { tipo: 'RESUMEN_DIARIO', cadenaId, fecha }, OPCIONES);
  }

  // Trabajo repetible de BullMQ: todos los días a las 23:00 de Bogotá, para
  // todas las cadenas. upsert: registrarlo en cada arranque no lo duplica.
  async programarResumenDiario() {
    await this.cola.upsertJobScheduler(
      'resumen-diario',
      { pattern: CRON_RESUMEN, tz: ZONA_RESUMEN },
      { name: 'resumen-diario', data: { tipo: 'RESUMEN_DIARIO' }, opts: OPCIONES },
    );
    this.logger.log(`Resumen diario programado (${CRON_RESUMEN}, ${ZONA_RESUMEN})`);
  }

  async onModuleDestroy() {
    await this.cola.close();
  }
}
