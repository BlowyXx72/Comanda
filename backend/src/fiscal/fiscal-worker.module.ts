import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AlmacenObjetosService } from './almacen-objetos.service.js';
import { ColaFiscalService } from './cola-fiscal.service.js';
import { ProcesadorFiscalService } from './procesador-fiscal.service.js';
import { ProveedorDianSimuladoService } from './proveedor-dian-simulado.service.js';

// Módulo raíz del contenedor `worker` (src/worker.ts). No levanta HTTP ni
// WebSocket: solo consume la cola fiscal.
@Module({
  imports: [PrismaModule],
  providers: [ProcesadorFiscalService, ProveedorDianSimuladoService, AlmacenObjetosService, ColaFiscalService],
})
export class FiscalWorkerModule {}
