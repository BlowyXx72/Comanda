import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// Consumido por: CatalogController (GET /productos) y OrdersModule
// (valida productos + toma el precio vigente al armar un pedido).
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listar(cadenaId: string) {
    return this.prisma.producto.findMany({
      where: { cadenaId },
      orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
    });
  }

  async obtenerDeCadena(productoId: string, cadenaId: string) {
    const producto = await this.prisma.producto.findUnique({ where: { id: productoId } });
    if (!producto || producto.cadenaId !== cadenaId) {
      throw new NotFoundException(`Producto ${productoId} no encontrado`);
    }
    return producto;
  }
}
