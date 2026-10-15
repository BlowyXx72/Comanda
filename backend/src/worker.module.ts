import { Module } from '@nestjs/common';
import { FiscalWorkerModule } from './fiscal/fiscal-worker.module.js';
import { IntegracionesWorkerModule } from './integrations/integraciones-worker.module.js';

// Módulo raíz del contenedor `worker` (src/worker.ts): junta los
// consumidores de todas las colas de BullMQ. No levanta HTTP ni WebSocket.
@Module({
  imports: [FiscalWorkerModule, IntegracionesWorkerModule],
})
export class WorkerModule {}
