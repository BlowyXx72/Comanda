import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { type Job, UnrecoverableError, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { conexionRedis } from '../queue/conexion-redis.js';
import { AlmacenObjetosService } from './almacen-objetos.service.js';
import { ColaFiscalService } from './cola-fiscal.service.js';
import { COLA_FISCAL, type ResultadoFiscal, type TrabajoFiscal } from './fiscal.types.js';
import { ProveedorDianNoDisponibleError, ProveedorDianSimuladoService } from './proveedor-dian-simulado.service.js';
import { generarXmlSimulado } from './xml-documento.js';

// Trabajador asíncrono de §5.1: corre en el contenedor `worker` (src/worker.ts),
// no en el backend que atiende la caja. Por cada documento fiscal: genera el
// XML, lo guarda en el almacén de objetos y lo "valida" contra el proveedor
// DIAN simulado. La caja ya respondió al cobrar; esto ocurre en segundo plano.
@Injectable()
export class ProcesadorFiscalService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ProcesadorFiscalService.name);
  private worker?: Worker<TrabajoFiscal, ResultadoFiscal>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly almacen: AlmacenObjetosService,
    private readonly proveedor: ProveedorDianSimuladoService,
    private readonly colaFiscal: ColaFiscalService,
  ) {}

  async onApplicationBootstrap() {
    this.worker = new Worker<TrabajoFiscal, ResultadoFiscal>(COLA_FISCAL, (job) => this.procesar(job), {
      connection: conexionRedis(),
    });
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Intento ${job?.attemptsMade} del documento ${job?.id} falló: ${err.message}`),
    );
    await this.reencolarPendientes();
    this.logger.log('Worker fiscal escuchando la cola');
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  // Si el backend cobró pero no alcanzó a encolar (p. ej. Redis caído), el
  // documento queda PENDIENTE sin trabajo. Al arrancar se re-encolan; el
  // jobId fijo evita duplicar los que sí estaban en la cola.
  private async reencolarPendientes() {
    const pendientes = await this.prisma.documentoFiscal.findMany({
      where: { estadoDian: 'PENDIENTE' },
      select: { id: true, sede: { select: { cadenaId: true } } },
    });
    for (const doc of pendientes) {
      await this.colaFiscal.encolar({ documentoFiscalId: doc.id, cadenaId: doc.sede.cadenaId });
    }
    if (pendientes.length > 0) this.logger.log(`${pendientes.length} documento(s) PENDIENTE re-encolados`);
  }

  private async procesar(job: Job<TrabajoFiscal, ResultadoFiscal>): Promise<ResultadoFiscal> {
    const { documentoFiscalId, cadenaId } = job.data;
    const doc = await this.prisma.documentoFiscal.findUnique({
      where: { id: documentoFiscalId },
      include: { sede: true, pedido: { include: { detalles: { include: { producto: true } } } } },
    });
    // UnrecoverableError: reintentar no va a hacer aparecer el documento.
    if (!doc || doc.sede.cadenaId !== cadenaId) {
      throw new UnrecoverableError(`Documento ${documentoFiscalId} no encontrado en la cadena ${cadenaId}`);
    }

    // Idempotente: si un reintento llega después de que otro intento ya lo
    // resolvió, solo se devuelve el estado actual.
    if (doc.estadoDian !== 'PENDIENTE') return this.resultado(doc);

    let urlXml = doc.urlXml;
    const xml = generarXmlSimulado(doc);
    if (!urlXml) {
      const llave = `${cadenaId}/${doc.sedeId}/${doc.consecutivo}-${doc.id}.xml`;
      urlXml = await this.almacen.subir(llave, xml, 'application/xml');
      await this.prisma.documentoFiscal.update({ where: { id: doc.id }, data: { urlXml } });
    }

    const intento = job.attemptsMade + 1;
    const maxIntentos = job.opts.attempts ?? 1;
    try {
      const respuesta = await this.proveedor.validar(xml);
      const actualizado = await this.prisma.documentoFiscal.update({
        where: { id: doc.id },
        data: {
          estadoDian: respuesta.aceptado ? 'VALIDADO_SIMULADO' : 'RECHAZADO_SIMULADO',
          mensajeDian: respuesta.mensaje,
          validadoEn: new Date(),
        },
      });
      return this.resultado(actualizado);
    } catch (err) {
      if (!(err instanceof ProveedorDianNoDisponibleError)) throw err;
      // Error técnico: BullMQ reintenta con backoff. En el último intento se
      // deja constancia del rechazo en vez de dejar el documento PENDIENTE.
      if (intento < maxIntentos) throw err;
      const actualizado = await this.prisma.documentoFiscal.update({
        where: { id: doc.id },
        data: {
          estadoDian: 'RECHAZADO_SIMULADO',
          mensajeDian: `Proveedor DIAN (simulado) no disponible tras ${maxIntentos} intentos`,
          validadoEn: new Date(),
        },
      });
      return this.resultado(actualizado);
    }
  }

  private resultado(doc: {
    id: string;
    pedidoId: string;
    sedeId: string;
    estadoDian: ResultadoFiscal['estadoDian'];
    urlXml: string | null;
    mensajeDian: string | null;
  }): ResultadoFiscal {
    return {
      documentoFiscalId: doc.id,
      pedidoId: doc.pedidoId,
      sedeId: doc.sedeId,
      estadoDian: doc.estadoDian,
      urlXml: doc.urlXml,
      mensajeDian: doc.mensajeDian,
    };
  }
}
