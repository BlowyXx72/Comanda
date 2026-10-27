import { Prisma } from '../generated/prisma/client.js';
import { ReportsService } from './reports.service.js';

// Fase 15 (ronda 3, Parte 1): los reportes cortan días, meses y franjas en
// America/Bogota (UTC-5), no en UTC. Prueba unitaria: la réplica se reemplaza
// por un tx falso que devuelve los pagos dados y guarda el `where` recibido.
const CADENA = 'cadena-1';
const SEDE = 'sede-1';

function pago(creadoEn: string, monto: number, canal = 'SALON') {
  return {
    creadoEn: new Date(creadoEn),
    monto: new Prisma.Decimal(monto),
    pedido: { sedeId: SEDE, canal, sede: { nombre: 'Centro' } },
  };
}

function crearServicio(pagos: ReturnType<typeof pago>[]) {
  const llamadas: { where: { creadoEn: { gte: Date; lt: Date } } }[] = [];
  const tx = {
    pago: {
      findMany: async (args: (typeof llamadas)[number]) => {
        llamadas.push(args);
        return pagos;
      },
    },
  };
  const replica = { conCadena: (_cadenaId: string, fn: (t: typeof tx) => unknown) => fn(tx) };
  const branches = { obtenerDeCadena: async () => ({ id: SEDE }) };
  return { servicio: new ReportsService(replica as never, branches as never), llamadas };
}

describe('ReportsService en zona America/Bogota', () => {
  it('el rango de un día va de 00:00 a 24:00 en Bogotá (05:00Z a 05:00Z del día siguiente)', async () => {
    const { servicio, llamadas } = crearServicio([]);
    await servicio.ventasDelDia(SEDE, CADENA, '2026-10-26');
    expect(llamadas[0].where.creadoEn.gte.toISOString()).toBe('2026-10-26T05:00:00.000Z');
    expect(llamadas[0].where.creadoEn.lt.toISOString()).toBe('2026-10-27T05:00:00.000Z');
  });

  it('un rango desde..hasta incluye el día final completo', async () => {
    const { servicio, llamadas } = crearServicio([]);
    await servicio.consolidado(CADENA, '2026-10-01', '2026-10-31');
    expect(llamadas[0].where.creadoEn.gte.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(llamadas[0].where.creadoEn.lt.toISOString()).toBe('2026-11-01T05:00:00.000Z');
  });

  it('una venta a las 22:00 de Bogotá (03:00Z del día siguiente) cuenta en el día de Bogotá', async () => {
    const { servicio } = crearServicio([pago('2026-10-27T03:00:00.000Z', 10000), pago('2026-10-26T15:00:00.000Z', 5000)]);
    const r = await servicio.consolidado(CADENA, '2026-10-26');
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].fecha).toBe('2026-10-26');
    expect(r.filas[0].cantidadPedidos).toBe(2);
    expect(r.totalGeneral.toNumber()).toBe(15000);
  });

  it('agrupa por mes de Bogotá: el 31/10 a las 23:30 es octubre aunque en UTC ya sea noviembre', async () => {
    const { servicio } = crearServicio([pago('2026-11-01T04:30:00.000Z', 8000), pago('2026-11-01T06:00:00.000Z', 2000)]);
    const r = await servicio.consolidado(CADENA, '2026-10-31', '2026-11-01', 'mes');
    expect(r.filas.map((f) => [f.fecha, f.totalVentas.toNumber()])).toEqual([
      ['2026-10', 8000],
      ['2026-11', 2000],
    ]);
  });

  it('las franjas usan la hora de Bogotá', async () => {
    const { servicio } = crearServicio([
      pago('2026-10-26T17:10:00.000Z', 1000), // 12:10 Bogotá
      pago('2026-10-26T17:50:00.000Z', 2000), // 12:50 Bogotá
      pago('2026-10-27T01:00:00.000Z', 3000), // 20:00 Bogotá
    ]);
    const r = await servicio.franjas(CADENA, '2026-10-26');
    expect(r.filas.map((f) => [f.hora, f.cantidadPedidos, f.totalVentas.toNumber()])).toEqual([
      [12, 2, 3000],
      [20, 1, 3000],
    ]);
  });

  it('sin fecha, "hoy" es el día de Bogotá aunque en UTC ya sea mañana', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T02:00:00.000Z')); // 21:00 del 26 en Bogotá
    try {
      const { servicio } = crearServicio([]);
      expect((await servicio.ventasDelDia(SEDE, CADENA)).fecha).toBe('2026-10-26');
    } finally {
      vi.useRealTimers();
    }
  });
});
