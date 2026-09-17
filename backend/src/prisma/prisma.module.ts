import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// Global: todos los módulos de negocio necesitan Prisma, así que se evita
// reimportarlo en cada uno.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
