import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { ServerOptions } from 'socket.io';

// Backplane de Socket.IO vía Redis Pub/Sub (ver README, "Servicios
// telemáticos usados y por qué"): con una sola instancia de backend, como en
// este prototipo, no hace falta para que funcione — pero es lo que permite
// que en producción varias instancias detrás de un balanceador compartan el
// mismo canal de eventos en tiempo real.
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  async connectToRedis(): Promise<void> {
    const host = process.env.REDIS_HOST ?? 'redis';
    const port = Number(process.env.REDIS_PORT_INTERNAL ?? 6379);

    const pubClient = new Redis({ host, port });
    const subClient = pubClient.duplicate();

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
