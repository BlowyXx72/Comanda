import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashApiKey } from './api-key.js';
import type { IntegracionAutenticada } from './integraciones.types.js';

const HEADER_API_KEY = 'x-api-key';

// Autentica a una plataforma externa por el header X-Api-Key, sin JWT: quien
// llama es un sistema de un tercero, no un usuario de la cadena. La cadena
// sale de la integración, nunca del cuerpo de la petición.
// TODO PRODUCCIÓN: rotación de llaves, varias llaves vigentes por plataforma
// y firma HMAC del cuerpo para detectar peticiones alteradas.
@Injectable()
export class ApiKeyPlataformaGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; integracion?: IntegracionAutenticada }>();
    const apiKey = request.headers[HEADER_API_KEY];
    if (!apiKey) {
      throw new UnauthorizedException('Falta el header X-Api-Key');
    }

    const integracion = await this.prisma.integracionPlataforma.findUnique({
      where: { apiKeyHash: hashApiKey(apiKey) },
      select: { id: true, cadenaId: true, nombre: true, activa: true },
    });
    // Mismo mensaje para llave desconocida y para integración desactivada:
    // no se confirma cuál de las dos es.
    if (!integracion?.activa) {
      throw new UnauthorizedException('API key inválida');
    }

    request.integracion = { id: integracion.id, cadenaId: integracion.cadenaId, nombre: integracion.nombre };
    return true;
  }
}
