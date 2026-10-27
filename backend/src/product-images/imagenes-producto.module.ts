import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ImagenesProductoController } from './imagenes-producto.controller.js';
import { ImagenesProductoService } from './imagenes-producto.service.js';
import { ImagenesPublicasController } from './imagenes-publicas.controller.js';

// Fase 16B (CU-03, §4.3, §5.1): fotos de producto para el catálogo y el menú
// QR. Las URL públicas las arma conImagenPublica() (imagen-publica.ts), que
// también usan CatalogService y PublicMenuService.
@Module({
  imports: [RealtimeModule, StorageModule],
  controllers: [ImagenesProductoController, ImagenesPublicasController],
  providers: [ImagenesProductoService],
  exports: [ImagenesProductoService],
})
export class ImagenesProductoModule {}
