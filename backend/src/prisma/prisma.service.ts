import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';

// Consumido por todos los módulos de negocio (Tenants, Branches, Users,
// Catalog, Tables, Orders, Payments) para acceder a la base de datos.
//
// DECISIÓN DE PROTOTIPO (Fase 12, §6.1): hay dos conexiones. `this` (el
// cliente heredado) usa DATABASE_URL, el rol dueño del esquema, que las
// políticas RLS solo dejan pasar por la política `dueno_total`: se reserva
// para lookups previos a conocer la cadena (login, X-Api-Key), seed y
// migraciones. Las operaciones de negocio van por `conCadena()`, que usa el
// rol `comanda_app` (DATABASE_URL_APP) sujeto a las políticas por cadena.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  private readonly clienteApp: PrismaClient;

  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    if (!process.env.DATABASE_URL_APP) {
      throw new Error('Falta DATABASE_URL_APP en el entorno (rol comanda_app, ver .env.example)');
    }
    this.clienteApp = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_APP }),
    });
  }

  // Abre una transacción con el rol sin privilegios de dueño y fija
  // `app.cadena_id` solo para esa transacción (set_config con is_local=true),
  // de modo que RLS filtre por la cadena y el valor no sobreviva en la
  // conexión del pool. Los filtros explícitos por cadenaId del código de
  // aplicación se mantienen como segunda capa.
  conCadena<T>(cadenaId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.clienteApp.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.cadena_id', ${cadenaId}, true)`;
      return fn(tx);
    });
  }

  async onModuleInit() {
    await this.$connect();
    await this.clienteApp.$connect();
    this.logger.log('Conexión a Postgres establecida (dueño + comanda_app)');
  }

  async onModuleDestroy() {
    await this.clienteApp.$disconnect();
    await this.$disconnect();
  }
}
