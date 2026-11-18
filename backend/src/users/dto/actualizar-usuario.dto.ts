import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { RolUsuario } from '../../generated/prisma/enums.js';
import { LARGO_MINIMO_CLAVE, ROLES_USUARIO } from './crear-usuario.dto.js';

// Todos opcionales: PATCH /usuarios/:id cambia solo lo que venga. El correo no
// se edita (es la llave del login); para cambiarlo se crea otro usuario.
export class ActualizarUsuarioDto {
  @IsOptional()
  @IsIn(ROLES_USUARIO)
  rol?: RolUsuario;

  // undefined = no cambia; null = todas las sedes de la cadena.
  @IsOptional()
  @IsString()
  sedeId?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  // Restablecer la contraseña (el ADMIN se la entrega al usuario).
  @IsOptional()
  @IsString()
  @MinLength(LARGO_MINIMO_CLAVE)
  password?: string;
}
