import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { TablesModule } from '../tables/tables.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [BranchesModule, CatalogModule, TablesModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
