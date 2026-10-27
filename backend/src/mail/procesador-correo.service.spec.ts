import { UnrecoverableError, type Job } from 'bullmq';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ReportsService } from '../reports/reports.service.js';
import type { ColaCorreoService } from './cola-correo.service.js';
import type { EnvioCorreoService } from './envio-correo.service.js';
import type { TrabajoCorreo } from './mail.types.js';
import { ProcesadorCorreoService } from './procesador-correo.service.js';

// Fase 15: el comprobante de domicilio (Fase 14B) solo sale si el cliente
// dejó correo, y nunca para un documento de otra cadena.
const CADENA = 'cadena-1';

const documento = (email: string | null, cadenaId = CADENA) => ({
  id: 'doc-1',
  consecutivo: 12,
  creadoEn: new Date('2026-10-20T15:00:00Z'),
  mensajeDian: 'Validación simulada OK',
  sede: { cadenaId, nombre: 'Centro' },
  pedido: {
    total: '25000',
    cliente: { nombre: 'Ana', email },
    detalles: [{ cantidad: 2, precioUnitario: '12500', producto: { nombre: 'Arepa' } }],
  },
});

function armar(doc: ReturnType<typeof documento> | null) {
  const prisma = {
    conCadena: vi.fn((_c: string, fn: (tx: unknown) => unknown) =>
      fn({ documentoFiscal: { findUnique: vi.fn(async () => doc) } }),
    ),
  };
  const envio = { enviar: vi.fn(async () => undefined) };
  const servicio = new ProcesadorCorreoService(
    prisma as unknown as PrismaService,
    envio as unknown as EnvioCorreoService,
    {} as ReportsService,
    {} as ColaCorreoService,
  );
  const procesar = () =>
    servicio['procesar']({
      data: { tipo: 'COMPROBANTE', documentoFiscalId: 'doc-1', cadenaId: CADENA },
    } as Job<TrabajoCorreo>);
  return { procesar, envio };
}

describe('ProcesadorCorreoService (comprobante)', () => {
  it('envía el comprobante al correo del cliente', async () => {
    const { procesar, envio } = armar(documento('ana@example.com'));

    await expect(procesar()).resolves.toEqual({ enviado: true });

    expect(envio.enviar).toHaveBeenCalledTimes(1);
    expect(envio.enviar).toHaveBeenCalledWith(expect.objectContaining({ para: 'ana@example.com' }));
  });

  it('si el cliente no dejó correo, lo omite sin fallar', async () => {
    const { procesar, envio } = armar(documento(null));
    await expect(procesar()).resolves.toEqual({ enviado: false });
    expect(envio.enviar).not.toHaveBeenCalled();
  });

  it('un documento de otra cadena falla sin reintentos y no envía nada', async () => {
    const { procesar, envio } = armar(documento('ana@example.com', 'otra-cadena'));
    await expect(procesar()).rejects.toBeInstanceOf(UnrecoverableError);
    expect(envio.enviar).not.toHaveBeenCalled();
  });
});
