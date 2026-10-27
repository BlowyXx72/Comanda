import { Module } from '@nestjs/common';
import { AlmacenObjetosService } from './almacen-objetos.service.js';

// Fase 16B: almacén de objetos compartido (§5.1). Lo importan FiscalModule,
// FiscalWorkerModule e ImagenesProductoModule; ninguno depende de los otros.
@Module({
  providers: [AlmacenObjetosService],
  exports: [AlmacenObjetosService],
})
export class StorageModule {}
