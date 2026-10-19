import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { InsumosController } from './insumos.controller.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';
import { RecetasController } from './recetas.controller.js';

@Module({
  imports: [BranchesModule, CatalogModule, RealtimeModule],
  controllers: [InsumosController, RecetasController, InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
