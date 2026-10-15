import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

const MAX_ACUSES = 50;
const llaveAcuses = (integracionId: string) => `simulador-plataforma:acuses:${integracionId}`;

export interface AcuseRecibido {
  recibidoEn: string;
  cuerpo: unknown;
}

// DECISIÓN DE PROTOTIPO: "buzón" de la plataforma simulada. Hace el papel del
// servidor de la plataforma que recibe los acuses por webhook; la página
// /simulador-plataforma los lee de aquí. Se guarda en Redis (y no en
// memoria) para que siga funcionando con dos instancias de backend (13B).
// No es parte de Comanda: en producción el webhook sería de la plataforma.
@Injectable()
export class SimuladorPlataformaService implements OnModuleDestroy {
  private readonly redis = new Redis({
    host: process.env.REDIS_HOST ?? 'redis',
    port: Number(process.env.REDIS_PORT_INTERNAL ?? 6379),
  });

  async guardarAcuse(integracionId: string, cuerpo: unknown) {
    const acuse: AcuseRecibido = { recibidoEn: new Date().toISOString(), cuerpo };
    await this.redis
      .multi()
      .lpush(llaveAcuses(integracionId), JSON.stringify(acuse))
      .ltrim(llaveAcuses(integracionId), 0, MAX_ACUSES - 1)
      .exec();
  }

  async listarAcuses(integracionId: string): Promise<AcuseRecibido[]> {
    const crudos = await this.redis.lrange(llaveAcuses(integracionId), 0, MAX_ACUSES - 1);
    return crudos.map((crudo) => JSON.parse(crudo) as AcuseRecibido);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
