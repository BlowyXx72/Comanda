import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service.js';

// Consumido por: infraestructura (docker-compose healthcheck futuro, monitoreo manual en la demo).
// No pertenece a un módulo de negocio: es el chequeo de arranque del prototipo.
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @ApiOperation({ summary: 'Verifica conexión real a Postgres (Prisma) y Redis (PING)' })
  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);

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

  private async checkRedis(): Promise<boolean> {
    // Conexión efímera solo para el chequeo: el cliente real y persistente
    // vive en RealtimeModule (adapter de Socket.IO), no aquí.
    const client = new Redis({
      host: process.env.REDIS_HOST ?? 'redis',
      port: Number(process.env.REDIS_PORT_INTERNAL ?? 6379),
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    try {
      await client.connect();
      const respuesta = await client.ping();
      return respuesta === 'PONG';
    } catch {
      return false;
    } finally {
      client.disconnect();
    }
  }
}
