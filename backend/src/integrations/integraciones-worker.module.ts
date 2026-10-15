import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProcesadorAcusesService } from './procesador-acuses.service.js';

// Lado "worker" de la Fase 12B: consume la cola de acuses a plataformas. Lo
// importa WorkerModule (src/worker.module.ts).
@Module({
  imports: [PrismaModule],
  providers: [ProcesadorAcusesService],
})
export class IntegracionesWorkerModule {}
