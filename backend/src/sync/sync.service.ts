import { BadRequestException, ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { verificarSedeDelUsuario } from '../auth/sede-usuario.js';
import type { CreatePedidoDto } from '../orders/dto/create-pedido.dto.js';
import { OrdersService } from '../orders/orders.service.js';
import type { PagoOfflineDto } from '../payments/dto/pago-offline.dto.js';
import { PaymentsService } from '../payments/payments.service.js';

export type ResultadoSync =
  | { id: string; resultado: 'CREADO' | 'DUPLICADO' }
  | { id: string; resultado: 'RECHAZADO'; motivo: string };

// Consumido por: SyncController (POST /sync), que vacía la cola local de
// pedidos que el mesero armó sin conexión y, desde la Fase 16, la de cobros
// que la caja hizo sin conexión (CU-07, §6.3).
@Injectable()
export class SyncService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
  ) {}

  // Pedidos primero y luego pagos, en orden y de a uno, con la misma lógica
  // de POST /pedidos y POST /pagos: un elemento rechazado (p. ej. mesa ya
  // ocupada) no tumba al resto del lote. La respuesta es un solo arreglo con
  // el resultado de cada pedido y luego el de cada pago.
  async aplicar(
    { pedidos = [], pagos = [] }: { pedidos?: CreatePedidoDto[]; pagos?: PagoOfflineDto[] },
    usuario: Pick<UsuarioAutenticado, 'userId' | 'rol' | 'cadenaId' | 'sedeId'>,
  ): Promise<ResultadoSync[]> {
    const { userId, rol, cadenaId, sedeId } = usuario;
    if (pedidos.length === 0 && pagos.length === 0) {
      throw new BadRequestException('El lote debe traer al menos un pedido o un pago');
    }
    // Mismos roles que POST /pedidos (mesero) y POST /pagos (caja).
    if (pedidos.length > 0 && rol === 'CAJERO') {
      throw new ForbiddenException('El rol CAJERO no crea pedidos');
    }
    if (pagos.length > 0 && rol === 'MESERO') {
      throw new ForbiddenException('El rol MESERO no cobra');
    }

    const resultados: ResultadoSync[] = [];
    for (const dto of pedidos) {
      resultados.push(
        await this.aplicarUno(dto.id, async () => {
          // Fase 17: un pedido de otra sede se rechaza solo, sin tumbar el lote.
          verificarSedeDelUsuario(usuario, dto.sedeId);
          const { duplicado } = await this.ordersService.crearConResultado(dto, userId, cadenaId);
          return duplicado;
        }),
      );
    }
    for (const dto of pagos) {
      resultados.push(
        await this.aplicarUno(dto.id, async () => (await this.paymentsService.pagarSincronizado(dto, cadenaId, sedeId)).duplicado),
      );
    }
    return resultados;
  }

  private async aplicarUno(id: string, aplicar: () => Promise<boolean>): Promise<ResultadoSync> {
    try {
      return { id, resultado: (await aplicar()) ? 'DUPLICADO' : 'CREADO' };
    } catch (err) {
      // Solo los errores de negocio (404/409...) se reportan por elemento;
      // un fallo inesperado (p. ej. la base caída) aborta el lote y el
      // cliente lo reintenta completo, lo cual es seguro por idempotencia.
      if (!(err instanceof HttpException)) throw err;
      return { id, resultado: 'RECHAZADO', motivo: err.message };
    }
  }
}
