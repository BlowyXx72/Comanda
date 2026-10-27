import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { subdominioDeHost, urlPublicaCadena } from './subdominio.js';

export interface CadenaDelHost {
  id: string;
  nombre: string;
  subdominio: string;
}

// Un subdominio casi nunca cambia y el menú QR lo consulta en cada visita.
const VIGENCIA_CACHE_MS = 60_000;

// Fase 20B (§5.2): resuelve la cadena por el Host de la petición en las rutas
// públicas (menú QR, domicilio, login), además del cadena_id del JWT en las
// privadas. Consumido por: CadenaController, PublicMenuController,
// PublicOrdersController y AuthController.
// Como el login y X-Api-Key, esta búsqueda ocurre antes de conocer la cadena,
// así que usa el cliente dueño (no conCadena()).
@Injectable()
export class CadenaPorHostService {
  private readonly cache = new Map<string, { cadena: CadenaDelHost | null; vence: number }>();

  constructor(private readonly prisma: PrismaService) {}

  // null si el Host no es el subdominio de ninguna cadena (dominio principal,
  // localhost, subdominios apagados...): en ese caso no se restringe nada.
  async resolver(host: string | undefined): Promise<CadenaDelHost | null> {
    const subdominio = subdominioDeHost(host);
    if (!subdominio) return null;

    const guardada = this.cache.get(subdominio);
    if (guardada && guardada.vence > Date.now()) return guardada.cadena;

    const cadena = await this.prisma.cadena.findUnique({
      where: { subdominio },
      select: { id: true, nombre: true, subdominio: true },
    });
    const resultado = cadena?.subdominio ? { ...cadena, subdominio: cadena.subdominio } : null;
    this.cache.set(subdominio, { cadena: resultado, vence: Date.now() + VIGENCIA_CACHE_MS });
    return resultado;
  }

  // Un subdominio que no es de ninguna cadena responde 404, igual que un menú
  // de una sede que no existe.
  async resolverObligatoria(host: string | undefined): Promise<CadenaDelHost> {
    const cadena = await this.resolver(host);
    if (!cadena) throw new NotFoundException('Cadena no encontrada');
    return cadena;
  }

  // En las rutas públicas que traen cadenaId (menú, domicilio): si se entra
  // por el subdominio de una cadena, el cadenaId tiene que ser el de ella.
  async verificar(host: string | undefined, cadenaId: string) {
    const cadena = await this.resolver(host);
    if (cadena && cadena.id !== cadenaId) {
      throw new NotFoundException('Menú no encontrado');
    }
  }

  async datosDeCadena(cadenaId: string) {
    const cadena = await this.prisma.conCadena(cadenaId, (tx) =>
      tx.cadena.findUnique({ where: { id: cadenaId }, select: { id: true, nombre: true, subdominio: true } }),
    );
    if (!cadena) throw new NotFoundException('Cadena no encontrada');
    return { ...cadena, urlPublica: urlPublicaCadena(cadena.subdominio) };
  }
}
