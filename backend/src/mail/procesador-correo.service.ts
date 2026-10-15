import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { type Job, UnrecoverableError, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { conexionRedis } from '../queue/conexion-redis.js';
import { ReportsService } from '../reports/reports.service.js';
import { ColaCorreoService, ZONA_RESUMEN } from './cola-correo.service.js';
import { EnvioCorreoService } from './envio-correo.service.js';
import { COLA_CORREO, type TrabajoCorreo } from './mail.types.js';
import { correoComprobante, correoResumenDiario } from './plantillas-correo.js';

// AAAA-MM-DD del día actual en la zona del resumen (en-CA da ese formato).
const hoyEnZona = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_RESUMEN }).format(new Date());

// Corre en el contenedor `worker` (Fase 14B, §5.2 SMTP): manda el
// comprobante de los domicilios validados y el resumen diario a los ADMIN.
// Si el SMTP falla, BullMQ reintenta con backoff.
@Injectable()
export class ProcesadorCorreoService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ProcesadorCorreoService.name);
  private worker?: Worker<TrabajoCorreo>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly envio: EnvioCorreoService,
    private readonly reports: ReportsService,
    private readonly colaCorreo: ColaCorreoService,
  ) {}

  async onApplicationBootstrap() {
    this.worker = new Worker<TrabajoCorreo>(COLA_CORREO, (job) => this.procesar(job), {
      connection: conexionRedis(),
    });
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Intento ${job?.attemptsMade} del correo ${job?.id} falló: ${err.message}`),
    );
    await this.colaCorreo.programarResumenDiario();
    this.logger.log('Worker de correo escuchando la cola');
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async procesar(job: Job<TrabajoCorreo>) {
    const trabajo = job.data;
    if (trabajo.tipo === 'COMPROBANTE') {
      return this.enviarComprobante(trabajo.documentoFiscalId, trabajo.cadenaId);
    }
    return this.enviarResumenes(trabajo.cadenaId, trabajo.fecha ?? hoyEnZona());
  }

  private async enviarComprobante(documentoFiscalId: string, cadenaId: string) {
    const doc = await this.prisma.documentoFiscal.findUnique({
      where: { id: documentoFiscalId },
      include: { sede: true, pedido: { include: { cliente: true, detalles: { include: { producto: true } } } } },
    });
    if (!doc || doc.sede.cadenaId !== cadenaId) {
      throw new UnrecoverableError(`Documento ${documentoFiscalId} no encontrado en la cadena ${cadenaId}`);
    }
    const cliente = doc.pedido.cliente;
    if (!cliente?.email) {
      return { enviado: false };
    }

    await this.envio.enviar(
      correoComprobante({
        para: cliente.email,
        clienteNombre: cliente.nombre,
        sedeNombre: doc.sede.nombre,
        consecutivo: doc.consecutivo,
        fecha: doc.creadoEn,
        total: doc.pedido.total,
        mensajeDian: doc.mensajeDian,
        lineas: doc.pedido.detalles.map((d) => ({
          nombre: d.producto.nombre,
          cantidad: d.cantidad,
          precioUnitario: d.precioUnitario,
        })),
      }),
    );
    return { enviado: true };
  }

  // Un correo por cadena, a todos sus ADMIN. Reutiliza el consolidado de la
  // Fase 9 (ReportsService) para el día pedido.
  // Nota: hoy el consolidado cuenta el día en UTC; la Fase 14 (Parte 1) lo
  // pasa a la zona de Bogotá, y entonces coincidirá con `fecha`.
  private async enviarResumenes(cadenaId: string | undefined, fecha: string) {
    const cadenas = await this.prisma.cadena.findMany({
      where: cadenaId ? { id: cadenaId } : {},
      select: { id: true, nombre: true, usuarios: { where: { rol: 'ADMIN' }, select: { email: true } } },
    });

    let enviados = 0;
    for (const cadena of cadenas) {
      if (cadena.usuarios.length === 0) continue;
      const reporte = await this.reports.consolidado(cadena.id, fecha, fecha);
      await this.envio.enviar(
        correoResumenDiario({
          para: cadena.usuarios.map((u) => u.email),
          cadenaNombre: cadena.nombre,
          fecha,
          filas: reporte.filas,
          totalGeneral: reporte.totalGeneral,
        }),
      );
      enviados++;
    }
    return { enviados, fecha };
  }
}
