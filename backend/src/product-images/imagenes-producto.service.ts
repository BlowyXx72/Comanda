import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { AlmacenObjetosService } from '../storage/almacen-objetos.service.js';
import { conImagenPublica, llaveBase, llaveVariante, TAMANOS_IMAGEN } from './imagen-publica.js';
import { ImagenInvalidaError, procesarImagen } from './procesar-imagen.js';

// Una llave nueva por cada subida (no se sobrescribe la anterior), así la
// URL cambia y el navegador o la CDN pueden guardarla en caché "para siempre".
const CACHE_INMUTABLE = 'public, max-age=31536000, immutable';

// Fase 16B (CU-03, §5.1): foto de cada producto del catálogo, en el almacén
// de objetos. Consumido por: ImagenesProductoController (POST/DELETE
// /productos/:id/imagen) y prisma/seed-imagenes.ts.
@Injectable()
export class ImagenesProductoService {
  private readonly logger = new Logger(ImagenesProductoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly almacen: AlmacenObjetosService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async subir(productoId: string, cadenaId: string, archivo: Buffer) {
    const anterior = await this.obtenerDeCadena(productoId, cadenaId);

    let variantes;
    try {
      variantes = await procesarImagen(archivo);
    } catch (err) {
      if (err instanceof ImagenInvalidaError) throw new BadRequestException(err.message);
      throw err;
    }

    const base = `productos/${cadenaId}/${productoId}-${Date.now().toString(36)}`;
    const bucket = this.almacen.bucketImagenes;
    for (const tamano of TAMANOS_IMAGEN) {
      await this.almacen.subir(llaveVariante(base, tamano), variantes[tamano], 'image/webp', {
        bucket,
        cacheControl: CACHE_INMUTABLE,
      });
    }

    return this.reemplazar(productoId, cadenaId, `s3://${bucket}/${base}`, anterior.imagenUrl);
  }

  async quitar(productoId: string, cadenaId: string) {
    const anterior = await this.obtenerDeCadena(productoId, cadenaId);
    return this.reemplazar(productoId, cadenaId, null, anterior.imagenUrl);
  }

  private async reemplazar(productoId: string, cadenaId: string, imagenUrl: string | null, anterior: string | null) {
    const producto = await this.prisma.conCadena(cadenaId, (tx) =>
      tx.producto.update({ where: { id: productoId }, data: { imagenUrl } }),
    );
    // Igual que una edición del catálogo (Fase 10): /mesas y el menú QR de
    // todas las sedes recargan el producto en vivo.
    this.realtimeGateway.emitirCatalogoActualizado(cadenaId, { productoId, accion: 'ACTUALIZADO' });

    // La foto vieja se borra después de guardar la nueva; si falla, solo
    // queda un objeto huérfano, nunca un producto sin foto.
    if (anterior) {
      const base = llaveBase(anterior);
      await this.almacen
        .borrar(
          this.almacen.separarUri(anterior).bucket,
          TAMANOS_IMAGEN.map((t) => llaveVariante(base, t)),
        )
        .catch((err: Error) => this.logger.warn(`No se pudo borrar la foto anterior ${anterior}: ${err.message}`));
    }
    return conImagenPublica(producto);
  }

  private async obtenerDeCadena(productoId: string, cadenaId: string) {
    const producto = await this.prisma.conCadena(cadenaId, (tx) => tx.producto.findUnique({ where: { id: productoId } }));
    // 404 también si es de otra cadena (con RLS ya ni se ve; filtro como segunda capa).
    if (!producto || producto.cadenaId !== cadenaId) {
      throw new NotFoundException(`Producto ${productoId} no encontrado`);
    }
    return producto;
  }
}
