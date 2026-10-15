import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { AlmacenObjetosService } from './almacen-objetos.service.js';
import { ColaFiscalService } from './cola-fiscal.service.js';
import { FiscalEventosService } from './fiscal-eventos.service.js';
import { FiscalController } from './fiscal.controller.js';

// Lado "backend" de la Fase 11B: encolar (PaymentsService), reenviar
// resultados por WebSocket y servir el XML. El procesamiento vive en
// FiscalWorkerModule, que solo arranca el contenedor `worker`.
@Module({
  imports: [RealtimeModule],
  controllers: [FiscalController],
  providers: [ColaFiscalService, FiscalEventosService, AlmacenObjetosService],
  exports: [ColaFiscalService],
})
export class FiscalModule {}
