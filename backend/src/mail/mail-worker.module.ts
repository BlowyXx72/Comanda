import { Module } from '@nestjs/common';
import { BranchesService } from '../branches/branches.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ReportsService } from '../reports/reports.service.js';
import { ColaCorreoModule } from './cola-correo.module.js';
import { EnvioCorreoService } from './envio-correo.service.js';
import { ProcesadorCorreoService } from './procesador-correo.service.js';

// Lado "worker" de la Fase 14B: consume la cola de correo y programa el
// resumen diario. Lo importa WorkerModule (src/worker.module.ts).
// ReportsService (y su dependencia BranchesService) se registran aquí como
// proveedores en vez de importar ReportsModule: ese módulo trae sus
// controladores con guards de JWT/Passport, que el worker no tiene. Así el
// resumen reutiliza el consolidado de la Fase 9 sin tocar reports/ (Parte 1).
@Module({
  imports: [PrismaModule, ColaCorreoModule],
  providers: [ProcesadorCorreoService, EnvioCorreoService, ReportsService, BranchesService],
})
export class MailWorkerModule {}
