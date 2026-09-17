import { Global, Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { RolesGuard } from './guards/roles.guard.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

// Global: JwtAuthGuard/RolesGuard se usan en controladores de otros módulos
// (Catalog, Branches, Orders, ...) que no necesitan reimportar AuthModule
// solo para que Passport resuelva AuthModuleOptions.
@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      // DECISIÓN DE PROTOTIPO: mismo fallback que en JwtStrategy.
      secret: process.env.JWT_SECRET ?? 'inseguro-solo-para-desarrollo-local',
      // El cast es porque JWT_EXPIRES_IN llega como `string` genérico desde
      // el .env, mientras que el tipo de la librería espera un literal tipo "8h".
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as JwtSignOptions['expiresIn'] },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard],
  exports: [JwtModule, PassportModule, RolesGuard],
})
export class AuthModule {}
