import { Module } from '@nestjs/common';
import { TablesService } from './tables.service.js';

@Module({
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}
