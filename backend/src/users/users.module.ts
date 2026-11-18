import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

// Gestión de usuarios de la cadena (/usuarios). Se separó de AuthModule
// cuando apareció la necesidad de crear usuarios y asignarles sede (ver
// CLAUDE.md, "TenantsModule y UsersModule").
@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
