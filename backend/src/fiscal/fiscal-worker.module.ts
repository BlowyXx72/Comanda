import { Module } from '@nestjs/common';
import { ColaCorreoModule } from '../mail/cola-correo.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ColaFiscalService } from './cola-fiscal.service.js';
import { ProcesadorFiscalService } from './procesador-fiscal.service.js';
import { ProveedorDianSimuladoService } from './proveedor-dian-simulado.service.js';

// Módulo raíz del contenedor `worker` (src/worker.ts). No levanta HTTP ni
// WebSocket: solo consume la cola fiscal.
@Module({
  imports: [PrismaModule, ColaCorreoModule, StorageModule],
  providers: [ProcesadorFiscalService, ProveedorDianSimuladoService, ColaFiscalService],
})
export class FiscalWorkerModule {}
