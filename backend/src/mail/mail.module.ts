import { Module } from '@nestjs/common';
import { ColaCorreoModule } from './cola-correo.module.js';
import { MailController } from './mail.controller.js';

// Lado "backend" de la Fase 14B (§5.2, SMTP): solo encola. El envío lo hace
// MailWorkerModule en el contenedor `worker`.
@Module({
  imports: [ColaCorreoModule],
  controllers: [MailController],
})
export class MailModule {}
