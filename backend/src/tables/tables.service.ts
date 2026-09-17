import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EstadoMesa } from '../generated/prisma/enums.js';

// Consumido por: BranchesModule (listar mesas de una sede) y OrdersModule
// (ocupar/liberar una mesa al crear un pedido o cobrarlo).
@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  listarPorSede(sedeId: string) {
    return this.prisma.mesa.findMany({
      where: { sedeId },
      orderBy: { numero: 'asc' },
    });
  }

  async obtenerDeSede(mesaId: string, sedeId: string) {
    const mesa = await this.prisma.mesa.findUnique({ where: { id: mesaId } });
    if (!mesa || mesa.sedeId !== sedeId) {
      throw new NotFoundException('Mesa no encontrada en esta sede');
    }
    return mesa;
  }

  async ocupar(mesaId: string, sedeId: string) {
    const mesa = await this.obtenerDeSede(mesaId, sedeId);
    if (mesa.estado === 'OCUPADA') {
      throw new ConflictException('La mesa ya está ocupada');
    }
    return this.prisma.mesa.update({ where: { id: mesaId }, data: { estado: 'OCUPADA' as EstadoMesa } });
  }

  liberar(mesaId: string) {
    return this.prisma.mesa.update({ where: { id: mesaId }, data: { estado: 'LIBRE' as EstadoMesa } });
  }
}
