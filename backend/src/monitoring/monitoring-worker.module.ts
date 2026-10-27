import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MonitorColasService } from './monitor-colas.service.js';

// Fase 21B: métricas de las colas para CloudWatch. Solo en el contenedor
// `worker` (WorkerModule).
@Module({
  imports: [PrismaModule],
  providers: [MonitorColasService],
})
export class MonitoringWorkerModule {}
