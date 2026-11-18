import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { RolUsuario } from '../../generated/prisma/enums.js';

export const ROLES_USUARIO: RolUsuario[] = ['ADMIN', 'CAJERO', 'MESERO'];

// DECISIÓN DE PROTOTIPO: mínimo de 6 caracteres, igual que las claves de demo
// del seed (mesero123...). La propuesta no fija una política de contraseñas.
export const LARGO_MINIMO_CLAVE = 6;

export class CrearUsuarioDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(LARGO_MINIMO_CLAVE)
  password!: string;

  @IsIn(ROLES_USUARIO)
  rol!: RolUsuario;

  // Sede donde opera. null u omitido = todas las sedes de la cadena (Fase 17).
  @IsOptional()
  @IsString()
  sedeId?: string | null;
}
