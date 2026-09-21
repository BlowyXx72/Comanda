import { Injectable } from '@nestjs/common';
import { BranchesService } from '../branches/branches.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Consumido por ReportsController (GET /reportes/ventas).
// DECISIÓN DE PROTOTIPO: reporte mínimo (total y cantidad del día por sede),
// pensado como base del futuro panel multi-sede consolidado, que está fuera
// de alcance de este prototipo (ver docs/prototipo-slice.md).
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchesService: BranchesService,
  ) {}

  async ventasDelDia(sedeId: string, cadenaId: string, fecha?: string) {
    await this.branchesService.obtenerDeCadena(sedeId, cadenaId);

    // DECISIÓN DE PROTOTIPO: el "día" se calcula en UTC por simplicidad; en
    // producción habría que usar la zona horaria de la sede.
    const base = fecha ? new Date(`${fecha}T00:00:00.000Z`) : new Date();
    const inicio = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
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
}
