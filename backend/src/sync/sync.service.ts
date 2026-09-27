import { HttpException, Injectable } from '@nestjs/common';
import type { CreatePedidoDto } from '../orders/dto/create-pedido.dto.js';
import { OrdersService } from '../orders/orders.service.js';

export type ResultadoSync =
  | { id: string; resultado: 'CREADO' | 'DUPLICADO' }
  | { id: string; resultado: 'RECHAZADO'; motivo: string };

// Consumido por: SyncController (POST /sync), que vacía la cola local de
// pedidos que el mesero armó sin conexión (CU-07, §6.3).
@Injectable()
export class SyncService {
  constructor(private readonly ordersService: OrdersService) {}

  // Se aplican en orden y de a uno, con la misma lógica de POST /pedidos:
  // un pedido rechazado (p. ej. mesa ya ocupada) no tumba al resto del lote.
  async aplicar(pedidos: CreatePedidoDto[], usuarioId: string, cadenaId: string): Promise<ResultadoSync[]> {
    const resultados: ResultadoSync[] = [];
    for (const dto of pedidos) {
      try {
        const { duplicado } = await this.ordersService.crearConResultado(dto, usuarioId, cadenaId);
        resultados.push({ id: dto.id, resultado: duplicado ? 'DUPLICADO' : 'CREADO' });
      } catch (err) {
        // Solo los errores de negocio (404/409...) se reportan por pedido;
        // un fallo inesperado (p. ej. la base caída) aborta el lote y el
        // cliente lo reintenta completo, lo cual es seguro por idempotencia.
        if (!(err instanceof HttpException)) throw err;
        resultados.push({ id: dto.id, resultado: 'RECHAZADO', motivo: err.message });
      }
    }
    return resultados;
  }
}
