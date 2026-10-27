import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module.js';
import { PublicMenuController } from './public-menu.controller.js';
import { PublicMenuService } from './public-menu.service.js';

@Module({
  imports: [TenancyModule],
  controllers: [PublicMenuController],
  providers: [PublicMenuService],
})
export class PublicMenuModule {}
