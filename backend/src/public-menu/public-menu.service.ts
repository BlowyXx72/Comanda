import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CategoriaMenu {
  categoria: string;
  productos: { id: string; nombre: string; precio: string }[];
}

export interface MenuPublico {
  sede: { id: string; nombre: string; direccion: string };
  categorias: CategoriaMenu[];
}

// Consumido por: PublicMenuController (GET /menu/:cadenaId/:sedeId, sin JWT).
// Solo expone lo que un comensal necesita ver: nada de ids de cadena, rangos
// fiscales, usuarios ni pedidos.
@Injectable()
export class PublicMenuService {
  constructor(private readonly prisma: PrismaService) {}

  async obtener(cadenaId: string, sedeId: string): Promise<MenuPublico> {
    // Fase 12 (§6.1): sin JWT, la cadena sale del path; conCadena() la fija
    // para RLS. Una sede de otra cadena queda invisible y cae en el 404.
    const { sede, productos } = await this.prisma.conCadena(cadenaId, async (tx) => ({
      sede: await tx.sede.findUnique({ where: { id: sedeId } }),
      productos: await tx.producto.findMany({
        // Igual que GET /productos (Fase 10): los dados de baja no se muestran.
        where: { cadenaId, activo: true },
        orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
        select: { id: true, nombre: true, precio: true, categoria: true },
      }),
    }));
    // Mismo criterio que BranchesService: 404 si la sede no es de esa cadena.
    if (!sede || sede.cadenaId !== cadenaId) {
      throw new NotFoundException('Menú no encontrado');
    }

    const porCategoria = new Map<string, CategoriaMenu>();
    for (const producto of productos) {
      let grupo = porCategoria.get(producto.categoria);
      if (!grupo) {
        grupo = { categoria: producto.categoria, productos: [] };
        porCategoria.set(producto.categoria, grupo);
      }
      grupo.productos.push({ id: producto.id, nombre: producto.nombre, precio: producto.precio.toString() });
    }

    return {
      sede: { id: sede.id, nombre: sede.nombre, direccion: sede.direccion },
      categorias: [...porCategoria.values()],
    };
  }
}
