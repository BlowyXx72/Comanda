import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';

const nombreRoomSede = (sedeId: string) => `sede:${sedeId}`;

// Canal en tiempo real por sede (ver README, "Servicios telemáticos usados y
// por qué"): el mesero envía la comanda por REST (OrdersService), y este
// Gateway es quien la empuja a cocina/caja sin que nadie tenga que refrescar.
//
// DECISIÓN DE PROTOTIPO: se valida el JWT en el handshake (igual que en REST)
// para que un cliente no pueda unirse a la room de una sede de otra cadena,
// pero no hay guards de rol aquí: no existe un rol "cocina" en el modelo de
// datos, así que cualquier usuario autenticado de la cadena puede escuchar.
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private readonly server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    try {
      if (!token) throw new Error('Falta token');
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      client.data.cadenaId = payload.cadenaId;
    } catch {
      this.logger.warn(`Conexión WebSocket rechazada (token inválido): ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('sede:unirse')
  async unirseASede(@ConnectedSocket() client: Socket, @MessageBody() data: { sedeId: string }) {
    const sede = await this.prisma.sede.findUnique({ where: { id: data?.sedeId } });
    if (!sede || sede.cadenaId !== client.data.cadenaId) {
      this.logger.warn(`Intento de unirse a una sede ajena: ${client.id} -> ${data?.sedeId}`);
      return;
    }
    await client.join(nombreRoomSede(data.sedeId));
  }

  // Llamado por OrdersService al crear un pedido. Lo escucha el KDS (/cocina).
  emitirComandaNueva(sedeId: string, pedido: unknown) {
    this.server.to(nombreRoomSede(sedeId)).emit('comanda:nueva', pedido);
  }

  // Llamado por OrdersService al cambiar el estado de un pedido. Lo escuchan
  // mesero y caja.
  emitirPedidoActualizado(sedeId: string, pedido: unknown) {
    this.server.to(nombreRoomSede(sedeId)).emit('pedido:actualizado', pedido);
  }
}
