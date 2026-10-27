import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { logsEnJson } from './config/entorno.js';
import { WorkerModule } from './worker.module.js';

// Punto de entrada del contenedor `worker` (Fase 11B, "trabajador asíncrono +
// cola de mensajes" de §5.1). Comparte código con el backend, pero corre en
// su propio proceso: una DIAN lenta o caída nunca frena a la caja. Desde la
// Fase 12B también entrega los acuses a las plataformas de domicilios, y desde
// la 14B envía los correos (comprobantes y resumen diario).
async function bootstrap() {
  // Fase 17B: mismo formato de logs que el backend (LOG_FORMATO=json en la beta).
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: new ConsoleLogger({ json: logsEnJson() }),
  });
  app.enableShutdownHooks();
}
await bootstrap();
