import { Injectable } from '@nestjs/common';
import { BranchesService } from '../branches/branches.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaReplicaService } from '../prisma/prisma-replica.service.js';

// DECISIÓN DE PROTOTIPO: el "día" (y el mes, y la hora de las franjas) se
// calcula en America/Bogota, la zona del público objetivo de la propuesta, en
// vez de UTC. Es una zona fija del negocio, no por sede: el prototipo no
// modela zona horaria por sede (TODO PRODUCCIÓN si hubiera sedes en otras
// zonas). Colombia no tiene horario de verano, así que UTC-5 constante es exacto.
const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

// YYYY-MM-DD en Bogotá de un instante (default: ahora).
function diaBogota(instante: Date = new Date()): string {
  return new Date(instante.getTime() - OFFSET_BOGOTA_MS).toISOString().slice(0, 10);
}

// Rango [inicio, fin) en instantes UTC que cubre los días calendario de Bogotá
// desde..hasta (ambos inclusive). Sin `desde` es hoy; sin `hasta` es `desde`.
function rangoBogota(desde?: string, hasta?: string) {
  const desdeDia = desde ?? diaBogota();
  const hastaDia = hasta ?? desdeDia;
  // 00:00 en Bogotá == 05:00 UTC.
  const inicio = new Date(new Date(`${desdeDia}T00:00:00.000Z`).getTime() + OFFSET_BOGOTA_MS);
  const fin = new Date(new Date(`${hastaDia}T00:00:00.000Z`).getTime() + OFFSET_BOGOTA_MS + DIA_MS);
  return { inicio, fin, desdeDia, hastaDia };
}

export interface FilaConsolidado {
  sedeId: string;
  sedeNombre: string;
  fecha: string;
  canal: string;
  cantidadPedidos: number;
  totalVentas: Prisma.Decimal;
}

export interface FilaProducto {
  productoId: string;
  productoNombre: string;
  cantidadVendida: number;
  total: Prisma.Decimal;
}

export interface FilaFranja {
  hora: number;
  cantidadPedidos: number;
  totalVentas: Prisma.Decimal;
}

// Consumido por ReportsController (GET /reportes/ventas, GET /reportes/consolidado).
@Injectable()
export class ReportsService {
  constructor(
    private readonly replica: PrismaReplicaService,
    private readonly branchesService: BranchesService,
  ) {}

  async ventasDelDia(sedeId: string, cadenaId: string, fecha?: string) {
    await this.branchesService.obtenerDeCadena(sedeId, cadenaId);

    const { inicio, fin, desdeDia } = rangoBogota(fecha);

    const pagos = await this.replica.conCadena(cadenaId, (tx) =>
      tx.pago.findMany({
        where: {
          creadoEn: { gte: inicio, lt: fin },
          pedido: { sedeId },
        },
      }),
    );

    const totalVentas = pagos.reduce((acc, pago) => acc.plus(pago.monto), new Prisma.Decimal(0));

    return {
      sedeId,
      fecha: desdeDia,
      cantidadPedidos: pagos.length,
      totalVentas,
    };
  }

  // Fase 9 (CU-06): base del panel multi-sede del dueño. Agrupa por sede, día
  // y canal sin asumir qué canales existen (`Pedido.canal` hoy solo tiene
  // SALON; los que agregue la Parte 2 — p. ej. DOMICILIO — aparecen solos).
  // Lee de la réplica de lectura (Fase 13, §5.1) para no competir con las
  // escrituras de venta.
  // Con agrupacion='mes' la clave `fecha` de cada fila es YYYY-MM en vez de
  // YYYY-MM-DD; el rango desde/hasta sigue siendo por días.
  async consolidado(cadenaId: string, desde?: string, hasta?: string, agrupacion: 'dia' | 'mes' = 'dia') {
    const { inicio, fin, desdeDia, hastaDia } = rangoBogota(desde, hasta);

    const pagos = await this.replica.conCadena(cadenaId, (tx) =>
      tx.pago.findMany({
        where: {
          creadoEn: { gte: inicio, lt: fin },
          pedido: { sede: { cadenaId } },
        },
        include: { pedido: { select: { sedeId: true, canal: true, sede: { select: { nombre: true } } } } },
        orderBy: { creadoEn: 'asc' },
      }),
    );

    const grupos = new Map<string, FilaConsolidado>();
    for (const pago of pagos) {
      const fecha = diaBogota(pago.creadoEn).slice(0, agrupacion === 'mes' ? 7 : 10);
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
      desde: desdeDia,
      hasta: hastaDia,
      filas,
      totalGeneral,
    };
  }

  // Fase 14 (§6.1): ventas por producto. Cuenta los detalles de los pedidos
  // cobrados en el rango (por fecha del pago), con el precio unitario con que
  // se vendió. Lee de la réplica, igual que consolidado().
  async productos(cadenaId: string, desde?: string, hasta?: string) {
    const { inicio, fin, desdeDia, hastaDia } = rangoBogota(desde, hasta);

    const detalles = await this.replica.conCadena(cadenaId, (tx) =>
      tx.pedidoDetalle.findMany({
        where: {
          pedido: {
            sede: { cadenaId },
            pagos: { some: { creadoEn: { gte: inicio, lt: fin } } },
          },
        },
        include: { producto: { select: { nombre: true } } },
      }),
    );

    const grupos = new Map<string, FilaProducto>();
    for (const detalle of detalles) {
      const subtotal = new Prisma.Decimal(detalle.precioUnitario).times(detalle.cantidad);
      const fila = grupos.get(detalle.productoId);
      if (fila) {
        fila.cantidadVendida += detalle.cantidad;
        fila.total = fila.total.plus(subtotal);
      } else {
        grupos.set(detalle.productoId, {
          productoId: detalle.productoId,
          productoNombre: detalle.producto.nombre,
          cantidadVendida: detalle.cantidad,
          total: subtotal,
        });
      }
    }

    const filas = [...grupos.values()].sort(
      (a, b) => b.cantidadVendida - a.cantidadVendida || a.productoNombre.localeCompare(b.productoNombre),
    );
    const totalGeneral = filas.reduce((acc, fila) => acc.plus(fila.total), new Prisma.Decimal(0));

    return {
      desde: desdeDia,
      hasta: hastaDia,
      filas,
      totalGeneral,
    };
  }

  // Fase 14 (§6.1): ventas por franja horaria. Agrupa los pagos por hora del
  // día (0-23). Solo aparecen las horas con ventas; no se rellenan las vacías.
  async franjas(cadenaId: string, desde?: string, hasta?: string) {
    const { inicio, fin, desdeDia, hastaDia } = rangoBogota(desde, hasta);

    const pagos = await this.replica.conCadena(cadenaId, (tx) =>
      tx.pago.findMany({
        where: {
          creadoEn: { gte: inicio, lt: fin },
          pedido: { sede: { cadenaId } },
        },
      }),
    );

    const grupos = new Map<number, FilaFranja>();
    for (const pago of pagos) {
      const hora = new Date(pago.creadoEn.getTime() - OFFSET_BOGOTA_MS).getUTCHours();
      const fila = grupos.get(hora);
      if (fila) {
        fila.cantidadPedidos += 1;
        fila.totalVentas = fila.totalVentas.plus(pago.monto);
      } else {
        grupos.set(hora, { hora, cantidadPedidos: 1, totalVentas: new Prisma.Decimal(pago.monto) });
      }
    }

    const filas = [...grupos.values()].sort((a, b) => a.hora - b.hora);
    const totalGeneral = filas.reduce((acc, fila) => acc.plus(fila.totalVentas), new Prisma.Decimal(0));

    return {
      desde: desdeDia,
      hasta: hastaDia,
      filas,
      totalGeneral,
    };
  }
}
