import { Module } from '@nestjs/common';
import { ColaCorreoService } from './cola-correo.service.js';

// Solo el productor de la cola de correo, para que lo importen el backend
// (MailModule), el worker fiscal (comprobantes) y el worker de correo sin
// arrastrar nada más.
@Module({
  providers: [ColaCorreoService],
  exports: [ColaCorreoService],
})
export class ColaCorreoModule {}
