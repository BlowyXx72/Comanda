import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // DECISIÓN DE PROTOTIPO: se permite cualquier origen porque en local el
  // frontend puede correr en distintos hosts/puertos según cómo lo levante
  // cada quien (docker vs. `npm run dev` directo). En producción esto se
  // restringe al dominio real del frontend.
  app.enableCors();

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
