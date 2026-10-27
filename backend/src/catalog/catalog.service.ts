import { Injectable, NotFoundException } from '@nestjs/common';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { conImagenPublica } from '../product-images/imagen-publica.js';
import type { ActualizarProductoDto } from './dto/actualizar-producto.dto.js';
import type { CrearProductoDto } from './dto/crear-producto.dto.js';

// Consumido por: CatalogController (GET/POST/PATCH/DELETE /productos) y
// OrdersModule (valida productos + toma el precio vigente al armar un pedido).
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  // Fase 16B: lo que sale por la API lleva la URL pública de la foto, nunca
  // la URI interna del almacén (conImagenPublica).
  async listar(cadenaId: string, incluirInactivos = false) {
    const productos = await this.prisma.conCadena(cadenaId, (tx) =>
      tx.producto.findMany({
        where: { cadenaId, ...(incluirInactivos ? {} : { activo: true }) },
        orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
      }),
    );
    return productos.map(conImagenPublica);
  }

  async obtenerDeCadena(productoId: string, cadenaId: string) {
    const producto = await this.prisma.conCadena(cadenaId, (tx) =>
      tx.producto.findUnique({ where: { id: productoId } }),
    );
    if (!producto || producto.cadenaId !== cadenaId) {
      throw new NotFoundException(`Producto ${productoId} no encontrado`);
    }
    return producto;
  }

  // Fase 10 (CU-08): catálogo centralizado — ADMIN crea/edita/desactiva el
  // producto una sola vez y `catalogo:actualizado` (room `cadena:{cadenaId}`)
  // avisa a todas las sedes, sin que cada mesero tenga que recargar la página.
  async crear(cadenaId: string, dto: CrearProductoDto) {
    const producto = await this.prisma.conCadena(cadenaId, (tx) =>
      tx.producto.create({ data: { cadenaId, ...dto } }),
    );
    this.realtimeGateway.emitirCatalogoActualizado(cadenaId, { productoId: producto.id, accion: 'CREADO' });
    return conImagenPublica(producto);
  }

  async actualizar(id: string, cadenaId: string, dto: ActualizarProductoDto) {
    await this.obtenerDeCadena(id, cadenaId);
    const producto = await this.prisma.conCadena(cadenaId, (tx) =>
      tx.producto.update({ where: { id }, data: dto }),
    );
    this.realtimeGateway.emitirCatalogoActualizado(cadenaId, { productoId: producto.id, accion: 'ACTUALIZADO' });
    return conImagenPublica(producto);
  }

  async desactivar(id: string, cadenaId: string) {
    await this.obtenerDeCadena(id, cadenaId);
    const producto = await this.prisma.conCadena(cadenaId, (tx) =>
      tx.producto.update({ where: { id }, data: { activo: false } }),
    );
    this.realtimeGateway.emitirCatalogoActualizado(cadenaId, { productoId: producto.id, accion: 'DESACTIVADO' });
    return conImagenPublica(producto);
  }
}
