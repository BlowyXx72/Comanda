import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';

@Module({
  imports: [OrdersModule, PaymentsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
