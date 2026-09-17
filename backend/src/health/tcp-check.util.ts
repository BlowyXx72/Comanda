import { Socket } from 'node:net';

/**
 * DECISIÓN DE PROTOTIPO: comprueba solo que el puerto TCP responde, sin
 * autenticarse contra el servicio real. Se usa hoy únicamente para Redis; se
 * reemplaza en la Fase 4 por un PING real del cliente ioredis del
 * RealtimeModule. El chequeo de Postgres ya usa Prisma (`SELECT 1`).
 */
export function checkTcpPort(
  host: string,
  port: number,
  timeoutMs = 2000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();

    const finish = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));

    socket.connect(port, host);
  });
}
