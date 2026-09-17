import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

// Consumido por todos los módulos de negocio (Tenants, Branches, Users,
// Catalog, Tables, Orders, Payments) para acceder a la base de datos.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Conexión a Postgres establecida');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
