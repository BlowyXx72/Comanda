import { Module } from '@nestjs/common';
import { CadenaPorHostService } from './cadena-por-host.service.js';
import { CadenaController } from './cadena.controller.js';

// Fase 20B (§5.2, DNS multi-tenant): subdominio por cadena. Lo importan
// AppModule (por el controlador), AuthModule, OrdersModule y
// PublicMenuModule (por el servicio).
@Module({
  controllers: [CadenaController],
  providers: [CadenaPorHostService],
  exports: [CadenaPorHostService],
})
export class TenancyModule {}
