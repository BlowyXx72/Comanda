import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';

// Punto de entrada del contenedor `worker` (Fase 11B, "trabajador asíncrono +
// cola de mensajes" de §5.1). Comparte código con el backend, pero corre en
// su propio proceso: una DIAN lenta o caída nunca frena a la caja. Desde la
// Fase 12B también entrega los acuses a las plataformas de domicilios.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
}
await bootstrap();
