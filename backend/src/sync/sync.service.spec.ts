import { ConflictException } from '@nestjs/common';
import type { CreatePedidoDto } from '../orders/dto/create-pedido.dto.js';
import type { OrdersService } from '../orders/orders.service.js';
import { SyncService } from './sync.service.js';

// Fase 15: POST /sync (CU-07, Fase 9B) aplica la cola offline pedido a pedido.
const pedido = (id: string) => ({ id, sedeId: 's1', detalles: [] }) as unknown as CreatePedidoDto;

function armar(crearConResultado: (dto: CreatePedidoDto) => Promise<{ duplicado: boolean }>) {
  const orders = { crearConResultado: vi.fn(crearConResultado) };
  return { servicio: new SyncService(orders as unknown as OrdersService), orders };
}

describe('SyncService', () => {
  it('reporta CREADO, DUPLICADO y RECHAZADO por pedido sin tumbar el lote', async () => {
    const { servicio, orders } = armar(async (dto) => {
      if (dto.id === 'p3') throw new ConflictException('La mesa ya está ocupada');
      return { duplicado: dto.id === 'p2' };
    });

    const resultados = await servicio.aplicar([pedido('p1'), pedido('p2'), pedido('p3'), pedido('p4')], 'u1', 'c1');

    expect(resultados).toEqual([
      { id: 'p1', resultado: 'CREADO' },
      { id: 'p2', resultado: 'DUPLICADO' },
      { id: 'p3', resultado: 'RECHAZADO', motivo: 'La mesa ya está ocupada' },
      { id: 'p4', resultado: 'CREADO' },
    ]);
    // Siempre con el usuario y la cadena del JWT, nunca del cuerpo.
    expect(orders.crearConResultado).toHaveBeenCalledWith(expect.anything(), 'u1', 'c1');
  });

  it('un error inesperado (p. ej. la base caída) aborta el lote para que el cliente lo reintente', async () => {
    const { servicio } = armar(async () => {
      throw new Error('connection refused');
    });
    await expect(servicio.aplicar([pedido('p1')], 'u1', 'c1')).rejects.toThrow('connection refused');
  });
});
