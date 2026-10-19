import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EstadoMesa } from '../generated/prisma/enums.js';

// Consumido por: BranchesModule (listar mesas de una sede) y OrdersModule
// (ocupar/liberar una mesa al crear un pedido o cobrarlo).
@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  // Fase 12 (§6.1): todas las operaciones abren su conexión con conCadena()
  // para que RLS filtre por la cadena; `mesas` no tiene cadena_id directo y su
  // política resuelve la cadena por la sede.
  listarPorSede(sedeId: string, cadenaId: string) {
    return this.prisma.conCadena(cadenaId, (tx) =>
      tx.mesa.findMany({
        where: { sedeId },
        orderBy: { numero: 'asc' },
      }),
    );
  }

  async obtenerDeSede(mesaId: string, sedeId: string, cadenaId: string) {
    const mesa = await this.prisma.conCadena(cadenaId, (tx) => tx.mesa.findUnique({ where: { id: mesaId } }));
    if (!mesa || mesa.sedeId !== sedeId) {
      throw new NotFoundException('Mesa no encontrada en esta sede');
    }
    return mesa;
  }

  async ocupar(mesaId: string, sedeId: string, cadenaId: string) {
    const mesa = await this.obtenerDeSede(mesaId, sedeId, cadenaId);
    if (mesa.estado === 'OCUPADA') {
      throw new ConflictException('La mesa ya está ocupada');
    }
    return this.prisma.conCadena(cadenaId, (tx) =>
      tx.mesa.update({ where: { id: mesaId }, data: { estado: 'OCUPADA' as EstadoMesa } }),
    );
  }

  liberar(mesaId: string, cadenaId: string) {
    return this.prisma.conCadena(cadenaId, (tx) =>
      tx.mesa.update({ where: { id: mesaId }, data: { estado: 'LIBRE' as EstadoMesa } }),
    );
  }
}
