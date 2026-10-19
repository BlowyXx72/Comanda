import { Global, Module } from '@nestjs/common';
import { PrismaReplicaService } from './prisma-replica.service.js';
import { PrismaService } from './prisma.service.js';

// Global: todos los módulos de negocio necesitan Prisma, así que se evita
// reimportarlo en cada uno.
@Global()
@Module({
  providers: [PrismaService, PrismaReplicaService],
  exports: [PrismaService, PrismaReplicaService],
})
export class PrismaModule {}
