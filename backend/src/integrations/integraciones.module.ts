import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { ApiKeyPlataformaGuard } from './api-key-plataforma.guard.js';
import { ColaAcusesService } from './cola-acuses.service.js';
import { IntegracionesController } from './integraciones.controller.js';
import { IntegracionesService } from './integraciones.service.js';
import { SimuladorPlataformaController } from './simulador/simulador-plataforma.controller.js';
import { SimuladorPlataformaService } from './simulador/simulador-plataforma.service.js';

// Fase 12B (CU-05): pedidos de plataformas de domicilios por API. El acuse de
// vuelta lo procesa IntegracionesWorkerModule en el contenedor `worker`.
@Module({
  imports: [OrdersModule],
  controllers: [IntegracionesController, SimuladorPlataformaController],
  providers: [IntegracionesService, ColaAcusesService, ApiKeyPlataformaGuard, SimuladorPlataformaService],
})
export class IntegracionesModule {}
