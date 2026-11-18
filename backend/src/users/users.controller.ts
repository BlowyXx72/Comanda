import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto.js';
import { CrearUsuarioDto } from './dto/crear-usuario.dto.js';
import { UsersService } from './users.service.js';

// Consumido por: ADMIN en /usuarios (crear meseros/cajeros y asignarles sede).
// Sin DELETE: la baja es lógica (PATCH activo=false), porque los pedidos
// guardan quién los tomó.
@ApiTags('usuarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('usuarios')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Lista los usuarios de la cadena (solo ADMIN)' })
  @Get()
  listar(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.usersService.listar(usuario.cadenaId);
  }

  @ApiOperation({ summary: 'Crea un usuario de la cadena con rol y sede (solo ADMIN)' })
  @Post()
  crear(@Body() dto: CrearUsuarioDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.usersService.crear(usuario.cadenaId, dto);
  }

  @ApiOperation({ summary: 'Cambia rol, sede, estado o contraseña de un usuario (solo ADMIN)' })
  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() dto: ActualizarUsuarioDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.usersService.actualizar(id, usuario.cadenaId, usuario.userId, dto);
  }
}
