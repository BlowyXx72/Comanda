import {
  BadRequestException,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { ImagenesProductoService } from './imagenes-producto.service.js';
import { TAMANO_MAXIMO_BYTES } from './procesar-imagen.js';

// Consumido por: /catalogo (SubirImagenProducto, solo ADMIN). Comparte el
// prefijo /productos con CatalogController (Parte 1) sin tocarlo.
@ApiTags('productos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('productos')
export class ImagenesProductoController {
  constructor(private readonly imagenesProducto: ImagenesProductoService) {}

  @ApiOperation({ summary: 'Sube o reemplaza la foto de un producto (JPEG, PNG o WebP, máx. 2 MB; solo ADMIN)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { imagen: { type: 'string', format: 'binary' } } } })
  @Post(':id/imagen')
  // Multer corta la subida al pasar el límite (413) sin leer el resto.
  @UseInterceptors(FileInterceptor('imagen', { limits: { fileSize: TAMANO_MAXIMO_BYTES, files: 1 } }))
  subir(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() archivo: { buffer: Buffer } | undefined,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    if (!archivo) throw new BadRequestException('Falta el archivo en el campo "imagen"');
    return this.imagenesProducto.subir(id, usuario.cadenaId, archivo.buffer);
  }

  @ApiOperation({ summary: 'Quita la foto de un producto (solo ADMIN)' })
  @Delete(':id/imagen')
  quitar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.imagenesProducto.quitar(id, usuario.cadenaId);
  }
}
