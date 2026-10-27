import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { COLA_FISCAL } from '../fiscal/fiscal.types.js';
import { COLA_ACUSES } from '../integrations/integraciones.types.js';
import { COLA_CORREO } from '../mail/mail.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { conexionRedis } from '../queue/conexion-redis.js';
import { lineaEmf } from './metricas-emf.js';

const INTERVALO_MS = Number(process.env.METRICAS_INTERVALO_MS ?? 60_000);
// Un documento fiscal que lleva más de esto PENDIENTE está atascado: con los
// reintentos por defecto (5, backoff desde 2 s) se resuelve en menos de 1 min.
const MINUTOS_ATASCADO = Number(process.env.METRICAS_MINUTOS_ATASCADO ?? 5);

const COLAS = { Fiscal: COLA_FISCAL, Plataformas: COLA_ACUSES, Correo: COLA_CORREO } as const;

export interface EstadoColas {
  documentosAtascados: number;
  colas: Record<keyof typeof COLAS, { enEspera: number; fallidos: number }>;
}

// Fase 21B (§5.1, monitoreo): cada minuto mide si la validación DIAN
// (simulada) se atascó y cuánto trabajo hay en cada cola. Corre en el
// contenedor `worker` (una sola instancia, así no se cuenta dos veces).
// - METRICAS_EMF=true (beta en AWS): una línea EMF que CloudWatch convierte
//   en métricas (espacio "Comanda"), sobre las que hay alarmas
//   (deploy/cloudwatch/crear-alarmas.sh).
// - Por defecto (local): solo un aviso en el log si hay documentos atascados.
@Injectable()
export class MonitorColasService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MonitorColasService.name);
  private readonly colas = Object.fromEntries(
    Object.entries(COLAS).map(([nombre, cola]) => [nombre, new Queue(cola, { connection: conexionRedis() })]),
  ) as Record<keyof typeof COLAS, Queue>;
  private temporizador?: ReturnType<typeof setInterval>;
  private readonly emf = process.env.METRICAS_EMF === 'true';
  private readonly ambiente = process.env.METRICAS_AMBIENTE ?? 'local';

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    this.temporizador = setInterval(() => {
      this.publicar().catch((err: Error) => this.logger.warn(`No se pudieron medir las colas: ${err.message}`));
    }, INTERVALO_MS);
  }

  async onModuleDestroy() {
    clearInterval(this.temporizador);
    await Promise.all(Object.values(this.colas).map((cola) => cola.close()));
  }

  async medir(): Promise<EstadoColas> {
    const limite = new Date(Date.now() - MINUTOS_ATASCADO * 60_000);
    // Recorre todas las cadenas, como el re-encolado al arrancar del worker
    // fiscal: va con el cliente dueño, no con conCadena().
    const documentosAtascados = await this.prisma.documentoFiscal.count({
      where: { estadoDian: 'PENDIENTE', creadoEn: { lt: limite } },
    });
    const entradas = await Promise.all(
      (Object.keys(COLAS) as (keyof typeof COLAS)[]).map(async (nombre) => {
        const c = await this.colas[nombre].getJobCounts('waiting', 'delayed', 'failed');
        return [nombre, { enEspera: (c.waiting ?? 0) + (c.delayed ?? 0), fallidos: c.failed ?? 0 }] as const;
      }),
    );
    return { documentosAtascados, colas: Object.fromEntries(entradas) as EstadoColas['colas'] };
  }

  async publicar() {
    const estado = await this.medir();
    if (this.emf) {
      const metricas: Parameters<typeof lineaEmf>[1] = {
        DocumentosFiscalesAtascados: { valor: estado.documentosAtascados, unidad: 'Count' },
      };
      for (const [nombre, { enEspera, fallidos }] of Object.entries(estado.colas)) {
        metricas[`Cola${nombre}EnEspera`] = { valor: enEspera, unidad: 'Count' };
        metricas[`Cola${nombre}Fallidos`] = { valor: fallidos, unidad: 'Count' };
      }
      // Directo a stdout: la línea EMF tiene que ser el JSON completo, sin el
      // envoltorio del logger de Nest.
      process.stdout.write(`${lineaEmf({ Ambiente: this.ambiente }, metricas)}\n`);
    } else if (estado.documentosAtascados > 0) {
      this.logger.warn(
        `${estado.documentosAtascados} documento(s) fiscal(es) PENDIENTE hace más de ${MINUTOS_ATASCADO} min`,
      );
    }
    return estado;
  }
}
