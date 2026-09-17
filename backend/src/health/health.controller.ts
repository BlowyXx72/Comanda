import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { checkTcpPort } from './tcp-check.util.js';

// Consumido por: infraestructura (docker-compose healthcheck futuro, monitoreo manual en la demo).
// No pertenece a un módulo de negocio: es el chequeo de arranque del prototipo.
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    const redisHost = process.env.REDIS_HOST ?? 'redis';
    const redisPort = Number(process.env.REDIS_PORT_INTERNAL ?? 6379);

    const [postgres, redis] = await Promise.all([
      this.checkPostgres(),
      // TODO PRODUCCION (Fase 4): reemplazar por un PING real con el cliente
      // ioredis que use el RealtimeModule, en vez de solo probar el puerto TCP.
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

  private async checkPostgres(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
