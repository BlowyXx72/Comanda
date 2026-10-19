import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { type Job, UnrecoverableError, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { conexionRedis } from '../queue/conexion-redis.js';
import { COLA_ACUSES, type TrabajoAcuse } from './integraciones.types.js';

const TIMEOUT_MS = 5000;

// Corre en el contenedor `worker`: avisa a la plataforma, por su webhook
// (`IntegracionPlataforma.urlAcuse`), que el pedido ya entró a la cocina de
// la sede. Si la plataforma no responde 2xx, BullMQ reintenta con backoff;
// el pedido ya está en cocina pase lo que pase con el acuse.
@Injectable()
export class ProcesadorAcusesService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ProcesadorAcusesService.name);
  private worker?: Worker<TrabajoAcuse>;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    this.worker = new Worker<TrabajoAcuse>(COLA_ACUSES, (job) => this.procesar(job), {
      connection: conexionRedis(),
    });
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Intento ${job?.attemptsMade} del acuse ${job?.id} falló: ${err.message}`),
    );
    this.logger.log('Worker de acuses a plataformas escuchando la cola');
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async procesar(job: Job<TrabajoAcuse>) {
    const { pedidoId, cadenaId, integracionId } = job.data;
    // Fase 12 (§6.1): el job lleva cadenaId; el acceso va por conCadena().
    const pedido = await this.prisma.conCadena(cadenaId, (tx) =>
      tx.pedido.findUnique({
        where: { id: pedidoId },
        include: { sede: true, integracion: true },
      }),
    );
    if (!pedido?.integracion || pedido.sede.cadenaId !== cadenaId || pedido.integracionId !== integracionId) {
      throw new UnrecoverableError(`Pedido ${pedidoId} no encontrado para la integración ${integracionId}`);
    }

    const url = pedido.integracion.urlAcuse;
    if (!url) {
      this.logger.log(`La integración ${pedido.integracion.nombre} no tiene webhook de acuse; se omite`);
      return { enviado: false };
    }

    // En el mismo formato propio de la plataforma simulada (ver
    // dto/pedido-plataforma.dto.ts): el acuse le habla en sus términos.
    const acuse = {
      orderId: pedido.referenciaExterna,
      externalId: pedido.id,
      status: 'ACCEPTED',
      store: pedido.sede.nombre,
      total: pedido.total.toString(),
      acceptedAt: pedido.fechaHora.toISOString(),
    };
    // TODO PRODUCCIÓN: firmar el cuerpo (HMAC con un secreto por
    // integración) para que la plataforma verifique que viene de Comanda.
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(acuse),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!respuesta.ok) {
      throw new Error(`La plataforma respondió ${respuesta.status} al acuse`);
    }

    this.logger.log(`Acuse del pedido ${pedido.referenciaExterna} entregado a ${pedido.integracion.nombre}`);
    return { enviado: true };
  }
}
