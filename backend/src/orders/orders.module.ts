import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { TablesModule } from '../tables/tables.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { PublicOrdersController } from './public-orders.controller.js';

@Module({
  imports: [BranchesModule, CatalogModule, TablesModule, RealtimeModule],
  controllers: [OrdersController, PublicOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
