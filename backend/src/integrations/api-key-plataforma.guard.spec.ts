import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ApiKeyPlataformaGuard } from './api-key-plataforma.guard.js';
import { hashApiKey } from './api-key.js';

// Fase 15: autenticación de plataformas por X-Api-Key (CU-05, Fase 12B).
const LLAVE = 'llave-de-prueba';

function armar(integracion: { id: string; cadenaId: string; nombre: string; activa: boolean } | null) {
  const findUnique = vi.fn(async () => integracion);
  const guard = new ApiKeyPlataformaGuard({ integracionPlataforma: { findUnique } } as unknown as PrismaService);
  const ejecutar = (headers: Record<string, string>) => {
    const request: { headers: Record<string, string>; integracion?: unknown } = { headers };
    const contexto = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
    return { resultado: guard.canActivate(contexto), request };
  };
  return { ejecutar, findUnique };
}

describe('ApiKeyPlataformaGuard', () => {
  it('rechaza la petición sin X-Api-Key', async () => {
    await expect(armar(null).ejecutar({}).resultado).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza una llave desconocida, buscándola solo por su hash', async () => {
    const { ejecutar, findUnique } = armar(null);
    await expect(ejecutar({ 'x-api-key': LLAVE }).resultado).rejects.toThrow('API key inválida');
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { apiKeyHash: hashApiKey(LLAVE) } }));
  });

  it('rechaza una integración desactivada con el mismo mensaje', async () => {
    const { ejecutar } = armar({ id: 'i1', cadenaId: 'c1', nombre: 'Simulador', activa: false });
    await expect(ejecutar({ 'x-api-key': LLAVE }).resultado).rejects.toThrow('API key inválida');
  });

  it('con una llave válida deja la integración (y su cadena) en la petición', async () => {
    const { ejecutar } = armar({ id: 'i1', cadenaId: 'c1', nombre: 'Simulador', activa: true });
    const { resultado, request } = ejecutar({ 'x-api-key': LLAVE });
    await expect(resultado).resolves.toBe(true);
    expect(request.integracion).toEqual({ id: 'i1', cadenaId: 'c1', nombre: 'Simulador' });
  });
});
