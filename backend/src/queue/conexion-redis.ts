import type { ConnectionOptions } from 'bullmq';

// Consumido por las colas de BullMQ (FiscalModule y, en fases siguientes,
// plataformas y correo): todas usan el mismo Redis que ya sirve de backplane
// a Socket.IO (ver realtime/redis-io.adapter.ts).
export function conexionRedis(): ConnectionOptions {
  return {
    host: process.env.REDIS_HOST ?? 'redis',
    port: Number(process.env.REDIS_PORT_INTERNAL ?? 6379),
    // Requerido por BullMQ para los workers: un comando bloqueante no debe
    // abortarse por el límite de reintentos de ioredis.
    maxRetriesPerRequest: null,
  };
}
