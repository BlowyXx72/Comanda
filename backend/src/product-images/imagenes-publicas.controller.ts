import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AlmacenObjetosService } from '../storage/almacen-objetos.service.js';

// Solo fotos de producto: productos/{cadenaId}/{productoId}-{version}-{400|800}.webp.
// Cualquier otra llave (p. ej. un XML fiscal, que es privado) da 404.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const LLAVE_VALIDA = new RegExp(`^productos/${UUID}/${UUID}-[0-9a-z]+-(400|800)\\.webp$`);

// Fase 16B: entrega pública de las fotos del menú QR, sin JWT (el comensal no
// inicia sesión). Solo se usa en local: en AWS URL_PUBLICA_IMAGENES apunta a
// CloudFront y el navegador ni pasa por aquí.
// TODO PRODUCCIÓN: CDN delante del bucket (§5.1, §4.3). En local, Nginx hace
// de caché de estas respuestas (ver nginx.conf, location /api/menu/imagenes/).
@ApiTags('menu-publico')
@Controller('menu/imagenes')
export class ImagenesPublicasController {
  constructor(private readonly almacen: AlmacenObjetosService) {}

  @ApiOperation({ summary: 'Foto de un producto del menú (sin autenticación, caché larga)' })
  @Get('*llave')
  async servir(@Param('llave') segmentos: string[] | string, @Res() res: Response) {
    const llave = Array.isArray(segmentos) ? segmentos.join('/') : segmentos;
    if (!LLAVE_VALIDA.test(llave)) throw new NotFoundException('Imagen no encontrada');

    const objeto = await this.almacen.descargar(this.almacen.bucketImagenes, llave);
    if (!objeto) throw new NotFoundException('Imagen no encontrada');

    res.set({
      'Content-Type': 'image/webp',
      // La llave cambia con cada foto nueva, así que nunca hay que revalidar.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      ...(objeto.tamano !== undefined ? { 'Content-Length': String(objeto.tamano) } : {}),
      ...(objeto.etag ? { ETag: objeto.etag } : {}),
    });
    objeto.cuerpo.pipe(res);
  }
}
