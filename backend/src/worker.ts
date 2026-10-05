import { NestFactory } from '@nestjs/core';
import { FiscalWorkerModule } from './fiscal/fiscal-worker.module.js';

// Punto de entrada del contenedor `worker` (Fase 11B, "trabajador asíncrono +
// cola de mensajes" de §5.1). Comparte código con el backend, pero corre en
// su propio proceso: una DIAN lenta o caída nunca frena a la caja.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(FiscalWorkerModule);
  app.enableShutdownHooks();
}
await bootstrap();
