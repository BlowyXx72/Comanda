import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { checkTcpPort } from './tcp-check.util.js';

// Consumido por: infraestructura (docker-compose healthcheck futuro, monitoreo manual en la demo).
// No pertenece a un módulo de negocio: es el chequeo de arranque de la Fase 0.
@Controller('health')
export class HealthController {
  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    const postgresHost = process.env.POSTGRES_HOST ?? 'postgres';
    const postgresPort = Number(process.env.POSTGRES_PORT_INTERNAL ?? 5432);
    const redisHost = process.env.REDIS_HOST ?? 'redis';
    const redisPort = Number(process.env.REDIS_PORT_INTERNAL ?? 6379);

    const [postgres, redis] = await Promise.all([
      checkTcpPort(postgresHost, postgresPort),
      checkTcpPort(redisHost, redisPort),
    ]);

    const status = {
      status: postgres && redis ? 'ok' : 'error',
      dependencies: {
        postgres: postgres ? 'up' : 'down',
        redis: redis ? 'up' : 'down',
      },
      timestamp: new Date().toISOString(),
    };

    if (!postgres || !redis) {
      throw new ServiceUnavailableException(status);
    }

    return status;
  }
}
