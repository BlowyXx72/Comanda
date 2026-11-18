import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto.js';
import type { CrearUsuarioDto } from './dto/crear-usuario.dto.js';

// Lo que sale por la API: nunca el hash de la contraseña.
const SELECCION_PUBLICA = {
  id: true,
  email: true,
  rol: true,
  sedeId: true,
  activo: true,
  sede: { select: { id: true, nombre: true } },
} satisfies Prisma.UsuarioSelect;

// Consumido por UsersController (GET/POST/PATCH /usuarios, solo ADMIN), que a
// su vez usa la pantalla /usuarios del frontend.
//
// DECISIÓN DE PROTOTIPO: la propuesta nombra un UsersModule y los perfiles
// (cajero, meseros, administrador), pero no fija cómo se gestionan. Hasta acá
// los usuarios solo salían del seed; sin esta pantalla no había forma de
// crear un mesero o asignarle una sede (Fase 17).
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  listar(cadenaId: string) {
    return this.prisma.conCadena(cadenaId, (tx) =>
      tx.usuario.findMany({ where: { cadenaId }, select: SELECCION_PUBLICA, orderBy: [{ rol: 'asc' }, { email: 'asc' }] }),
    );
  }

  async crear(cadenaId: string, dto: CrearUsuarioDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    try {
      return await this.prisma.conCadena(cadenaId, async (tx) => {
        await this.verificarSede(tx, cadenaId, dto.sedeId);
        return tx.usuario.create({
          data: { cadenaId, email: dto.email, rol: dto.rol, sedeId: dto.sedeId ?? null, passwordHash },
          select: SELECCION_PUBLICA,
        });
      });
    } catch (err) {
      // El correo es único en todo el sistema (es la llave del login), no por
      // cadena: puede chocar con el de otra cadena que RLS no deja ver.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese correo');
      }
      throw err;
    }
  }

  // `actorId`: el ADMIN que hace el cambio. No puede quitarse a sí mismo el
  // rol ADMIN ni desactivarse, para que la cadena no se quede sin quién
  // administre usuarios.
  async actualizar(id: string, cadenaId: string, actorId: string, dto: ActualizarUsuarioDto) {
    if (id === actorId && ((dto.rol && dto.rol !== 'ADMIN') || dto.activo === false)) {
      throw new BadRequestException('No puedes quitarte el rol de administrador ni desactivar tu propio usuario');
    }
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : undefined;

    return this.prisma.conCadena(cadenaId, async (tx) => {
      const existente = await tx.usuario.findUnique({ where: { id }, select: { cadenaId: true } });
      if (!existente || existente.cadenaId !== cadenaId) {
        throw new NotFoundException(`Usuario ${id} no encontrado`);
      }
      await this.verificarSede(tx, cadenaId, dto.sedeId);
      return tx.usuario.update({
        where: { id },
        data: {
          rol: dto.rol,
          // undefined deja la sede como está; null la quita (todas las sedes).
          sedeId: dto.sedeId,
          activo: dto.activo,
          passwordHash,
        },
        select: SELECCION_PUBLICA,
      });
    });
  }

  // La sede debe existir y ser de la cadena (RLS ya filtra, y este filtro de
  // aplicación es la segunda capa).
  private async verificarSede(tx: Prisma.TransactionClient, cadenaId: string, sedeId: string | null | undefined) {
    if (!sedeId) return;
    const sede = await tx.sede.findUnique({ where: { id: sedeId }, select: { cadenaId: true } });
    if (!sede || sede.cadenaId !== cadenaId) {
      throw new BadRequestException(`La sede ${sedeId} no pertenece a la cadena`);
    }
  }
}
