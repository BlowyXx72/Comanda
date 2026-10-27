import type { PrismaService } from '../prisma/prisma.service.js';
import { lineaEmf } from './metricas-emf.js';
import { MonitorColasService } from './monitor-colas.service.js';

// Fase 21B: métricas de las colas en Embedded Metric Format (CloudWatch).
describe('lineaEmf', () => {
  it('declara las métricas en _aws y deja los valores al nivel raíz', () => {
    const linea = JSON.parse(
      lineaEmf({ Ambiente: 'beta' }, { DocumentosFiscalesAtascados: { valor: 3, unidad: 'Count' } }, 1700000000000),
    );
    expect(linea).toEqual({
      _aws: {
        Timestamp: 1700000000000,
        CloudWatchMetrics: [
          {
            Namespace: 'Comanda',
            Dimensions: [['Ambiente']],
            Metrics: [{ Name: 'DocumentosFiscalesAtascados', Unit: 'Count' }],
          },
        ],
      },
      Ambiente: 'beta',
      DocumentosFiscalesAtascados: 3,
    });
  });
});

describe('MonitorColasService', () => {
  const original = { emf: process.env.METRICAS_EMF, ambiente: process.env.METRICAS_AMBIENTE };
  afterEach(() => {
    process.env.METRICAS_EMF = original.emf;
    process.env.METRICAS_AMBIENTE = original.ambiente;
    vi.restoreAllMocks();
  });

  function armar(atascados: number) {
    const count = vi.fn(async (_args: unknown) => atascados);
    const servicio = new MonitorColasService({ documentoFiscal: { count } } as unknown as PrismaService);
    // Colas falsas: sin Redis.
    const conteos = { waiting: 2, delayed: 1, failed: 4 };
    for (const cola of Object.values(servicio['colas'])) {
      vi.spyOn(cola, 'getJobCounts').mockResolvedValue(conteos);
    }
    return { servicio, count };
  }

  it('cuenta los documentos PENDIENTE viejos y el trabajo de cada cola', async () => {
    const { servicio, count } = armar(2);
    const estado = await servicio.medir();

    expect(estado.documentosAtascados).toBe(2);
    expect(estado.colas.Fiscal).toEqual({ enEspera: 3, fallidos: 4 });
    const filtro = count.mock.calls[0][0] as { where: { estadoDian: string; creadoEn: { lt: Date } } };
    expect(filtro.where.estadoDian).toBe('PENDIENTE');
    expect(filtro.where.creadoEn.lt.getTime()).toBeLessThan(Date.now() - 4 * 60_000);
    await servicio.onModuleDestroy();
  });

  it('con METRICAS_EMF=true escribe una línea EMF por stdout', async () => {
    process.env.METRICAS_EMF = 'true';
    process.env.METRICAS_AMBIENTE = 'beta';
    const { servicio } = armar(1);
    const salida = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await servicio.publicar();

    const linea = JSON.parse(String(salida.mock.calls.at(-1)?.[0]));
    expect(linea.Ambiente).toBe('beta');
    expect(linea.DocumentosFiscalesAtascados).toBe(1);
    expect(linea.ColaCorreoFallidos).toBe(4);
    expect(linea._aws.CloudWatchMetrics[0].Metrics).toHaveLength(7);
    await servicio.onModuleDestroy();
  });
});
