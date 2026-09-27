import { Module } from '@nestjs/common';
import { PublicMenuController } from './public-menu.controller.js';
import { PublicMenuService } from './public-menu.service.js';

@Module({
  controllers: [PublicMenuController],
  providers: [PublicMenuService],
})
export class PublicMenuModule {}
