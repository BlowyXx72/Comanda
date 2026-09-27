import { Injectable } from '@nestjs/common';
import { BranchesService } from '../branches/branches.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

// DECISIÓN DE PROTOTIPO: el "día" se calcula en UTC por simplicidad; en
// producción habría que usar la zona horaria de cada sede.
function inicioUtc(fecha?: string): Date {
  const base = fecha ? new Date(`${fecha}T00:00:00.000Z`) : new Date();
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
}

export interface FilaConsolidado {
  sedeId: string;
  sedeNombre: string;
  fecha: string;
  canal: string;
  cantidadPedidos: number;
  totalVentas: Prisma.Decimal;
}

// Consumido por ReportsController (GET /reportes/ventas, GET /reportes/consolidado).
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchesService: BranchesService,
  ) {}

  async ventasDelDia(sedeId: string, cadenaId: string, fecha?: string) {
    await this.branchesService.obtenerDeCadena(sedeId, cadenaId);

    const inicio = inicioUtc(fecha);
    const fin = new Date(inicio);
    fin.setUTCDate(fin.getUTCDate() + 1);

    const pagos = await this.prisma.pago.findMany({
      where: {
        creadoEn: { gte: inicio, lt: fin },
        pedido: { sedeId },
      },
    });

    const totalVentas = pagos.reduce((acc, pago) => acc.plus(pago.monto), new Prisma.Decimal(0));

    return {
      sedeId,
      fecha: inicio.toISOString().slice(0, 10),
      cantidadPedidos: pagos.length,
      totalVentas,
    };
  }

  // Fase 9 (CU-06): base del panel multi-sede del dueño. Agrupa por sede, día
  // y canal sin asumir qué canales existen (`Pedido.canal` hoy solo tiene
  // SALON; los que agregue la Parte 2 — p. ej. DOMICILIO — aparecen solos).
  // Sigue leyendo de la misma base transaccional: la réplica de lectura que
  // pide la propuesta para separar reportes de la carga de venta queda
  // `// TODO PRODUCCIÓN`.
  async consolidado(cadenaId: string, desde?: string, hasta?: string) {
    const inicio = inicioUtc(desde);
    const finBase = inicioUtc(hasta ?? desde);
    const fin = new Date(finBase);
    fin.setUTCDate(fin.getUTCDate() + 1);

    const pagos = await this.prisma.pago.findMany({
      where: {
        creadoEn: { gte: inicio, lt: fin },
        pedido: { sede: { cadenaId } },
      },
      include: { pedido: { select: { sedeId: true, canal: true, sede: { select: { nombre: true } } } } },
      orderBy: { creadoEn: 'asc' },
    });

    const grupos = new Map<string, FilaConsolidado>();
    for (const pago of pagos) {
      const fecha = pago.creadoEn.toISOString().slice(0, 10);
      const clave = `${pago.pedido.sedeId}|${fecha}|${pago.pedido.canal}`;
      const fila = grupos.get(clave);
      if (fila) {
        fila.cantidadPedidos += 1;
        fila.totalVentas = fila.totalVentas.plus(pago.monto);
      } else {
        grupos.set(clave, {
          sedeId: pago.pedido.sedeId,
          sedeNombre: pago.pedido.sede.nombre,
          fecha,
          canal: pago.pedido.canal,
          cantidadPedidos: 1,
          totalVentas: new Prisma.Decimal(pago.monto),
        });
      }
    }

    const filas = [...grupos.values()].sort(
      (a, b) => a.sedeNombre.localeCompare(b.sedeNombre) || a.fecha.localeCompare(b.fecha) || a.canal.localeCompare(b.canal),
    );
    const totalGeneral = filas.reduce((acc, fila) => acc.plus(fila.totalVentas), new Prisma.Decimal(0));

    return {
      desde: inicio.toISOString().slice(0, 10),
      hasta: finBase.toISOString().slice(0, 10),
      filas,
      totalGeneral,
    };
  }
}
