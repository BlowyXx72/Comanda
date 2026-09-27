import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';

@Module({
  imports: [OrdersModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
