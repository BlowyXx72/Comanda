import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// Consumido por: BranchesController y OrdersModule (valida que una sede
// pertenezca a la cadena del usuario antes de crear un pedido en ella).
@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  listar(cadenaId: string) {
    return this.prisma.sede.findMany({
      where: { cadenaId },
      orderBy: { nombre: 'asc' },
    });
  }

  async obtenerDeCadena(sedeId: string, cadenaId: string) {
    const sede = await this.prisma.sede.findUnique({ where: { id: sedeId } });
    // DECISIÓN DE PROTOTIPO: se responde 404 (no 403) cuando la sede es de
    // otra cadena, para no confirmarle a un usuario ajeno que el id existe.
    if (!sede || sede.cadenaId !== cadenaId) {
      throw new NotFoundException(`Sede ${sedeId} no encontrada`);
    }
    return sede;
  }
}
