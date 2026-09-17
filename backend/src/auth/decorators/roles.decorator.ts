import { SetMetadata } from '@nestjs/common';
import type { RolUsuario } from '../../generated/prisma/enums.js';

export const ROLES_KEY = 'roles';

// Uso: @Roles('ADMIN', 'CAJERO') junto con @UseGuards(JwtAuthGuard, RolesGuard)
export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_KEY, roles);
