import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

export interface Correo {
  para: string | string[];
  asunto: string;
  texto: string;
  html: string;
}

// Cliente SMTP (§5.2). En docker compose habla con Mailpit, que recibe todo y
// lo muestra en su bandeja web sin entregar nada de verdad.
// TODO PRODUCCIÓN: un relay SMTP real con TLS y autenticación, y SPF/DKIM en
// el dominio remitente. Basta con cambiar las variables SMTP_*.
// Consumido por: ProcesadorCorreoService (contenedor worker).
@Injectable()
export class EnvioCorreoService {
  private readonly logger = new Logger(EnvioCorreoService.name);
  private readonly remitente = process.env.SMTP_FROM ?? 'Comanda Central <no-responder@comanda.local>';
  private readonly transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'mailpit',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined,
  });

  async enviar(correo: Correo) {
    const info = await this.transporte.sendMail({
      from: this.remitente,
      to: correo.para,
      subject: correo.asunto,
      text: correo.texto,
      html: correo.html,
    });
    this.logger.log(`Correo "${correo.asunto}" enviado (${info.messageId})`);
  }
}
