import { Socket } from 'node:net';

/**
 * DECISIÓN DE PROTOTIPO (Fase 0): comprueba solo que el puerto TCP responde,
 * sin autenticarse contra el servicio real. Se reemplaza en fases siguientes
 * por una consulta real: Prisma (`SELECT 1`) para Postgres en la Fase 1 y un
 * PING de ioredis para Redis en la Fase 4, cuando esos clientes ya existan.
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
