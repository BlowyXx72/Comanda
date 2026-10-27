import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { logsEnJson, origenesCors, swaggerHabilitado } from './config/entorno.js';
import { RedisIoAdapter } from './realtime/redis-io.adapter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: logsEnJson() }),
  });

  // Fase 17B: en local cualquier origen; en la beta solo el dominio real
  // (CORS_ORIGENES, ver config/entorno.ts). El gateway usa la misma lista.
  app.enableCors({ origin: origenesCors() });

  // Fase 17B: ante SIGTERM (docker stop, un despliegue nuevo) Nest cierra en
  // orden: deja de aceptar conexiones, cierra Socket.IO, los productores de
  // las colas y Prisma (onModuleDestroy), en vez de cortar a la mitad.
  app.enableShutdownHooks();

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Fase 17B: apagado en producción (SWAGGER_HABILITADO=false).
  if (swaggerHabilitado()) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Comanda — API')
      .setDescription(
        'API REST del prototipo de Comanda Central (ver docs/prototipo-slice.md para el alcance). ' +
          'Los endpoints protegidos requieren el JWT de POST /auth/login (botón "Authorize").',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, swaggerDocument);
  }

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
