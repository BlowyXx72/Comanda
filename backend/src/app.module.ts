import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { BranchesModule } from './branches/branches.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { HealthModule } from './health/health.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PublicMenuModule } from './public-menu/public-menu.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { TablesModule } from './tables/tables.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BranchesModule,
    CatalogModule,
    TablesModule,
    OrdersModule,
    PaymentsModule,
    ReportsModule,
    HealthModule,
    PublicMenuModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
