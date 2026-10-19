import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';

// Fase 13 (§5.1): cliente de solo lectura contra `postgres-replica`, para que
// los reportes no compitan con las escrituras del servicio.
//
// DECISIÓN DE PROTOTIPO: la URL usa el rol `comanda_app` (la réplica es una
// copia física, así que el rol, su contraseña y las políticas RLS de la Fase
// 12 ya existen allí). Por eso `conCadena()` repite la mecánica de
// PrismaService: set_config es un GUC de sesión, no escribe, y funciona en
// hot_standby. La réplica rechaza cualquier escritura ("read-only
// transaction"), que es lo que verifica test/replica-solo-lectura.spec.ts.
// Solo ReportsService (y los endpoints de reportes de la Fase 14) lo usan.
@Injectable()
export class PrismaReplicaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaReplicaService.name);

  private readonly cliente: PrismaClient;

  constructor() {
    if (!process.env.DATABASE_URL_REPLICA) {
      throw new Error('Falta DATABASE_URL_REPLICA en el entorno (réplica de lectura, ver .env.example)');
    }
    this.cliente = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_REPLICA }),
    });
  }

  conCadena<T>(cadenaId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.cliente.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.cadena_id', ${cadenaId}, true)`;
      return fn(tx);
    });
  }

  async onModuleInit() {
    await this.cliente.$connect();
    this.logger.log('Conexión a la réplica de lectura establecida (comanda_app)');
  }

  async onModuleDestroy() {
    await this.cliente.$disconnect();
  }
}
