import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';
import { cargarUsuarioVigente } from '../auth/usuario-vigente.js';
import { origenesCors } from '../config/entorno.js';
import { PrismaService } from '../prisma/prisma.service.js';

const nombreRoomSede = (sedeId: string) => `sede:${sedeId}`;
const nombreRoomCadena = (cadenaId: string) => `cadena:${cadenaId}`;

// Lo que el middleware de autenticación deja en `socket.data` antes de
// aceptar la conexión.
interface DatosSocket {
  cadenaId: string;
  sedeId: string | null;
}

// Canal en tiempo real por sede (ver README, "Servicios telemáticos usados y
// por qué"): el mesero envía la comanda por REST (OrdersService), y este
// Gateway es quien la empuja a cocina/caja sin que nadie tenga que refrescar.
//
// DECISIÓN DE PROTOTIPO: se valida el JWT en el handshake (igual que en REST)
// para que un cliente no pueda unirse a la room de una sede de otra cadena,
// pero no hay guards de rol aquí: no existe un rol "cocina" en el modelo de
// datos, así que cualquier usuario autenticado de la cadena puede escuchar.
// Fase 17B: mismos orígenes que la API REST (CORS_ORIGENES).
@WebSocketGateway({ cors: { origin: origenesCors() } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private readonly server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // La identidad se resuelve en un middleware de Socket.IO y no en
  // handleConnection. Socket.IO no espera a que handleConnection (async)
  // termine para atender los eventos del cliente, y el cliente emite
  // `sede:unirse` apenas recibe `connect` (useComandaSocket). Con la consulta
  // del usuario vigente a la base, ese `sede:unirse` llegaba a veces antes de
  // conocer la cadena, se rechazaba como "sede ajena" y la pantalla se quedaba
  // sin eventos en vivo hasta reconectarse. Con el middleware, el cliente
  // recibe `connect` solo cuando la identidad ya está en socket.data.
  afterInit(server: Server) {
    server.use((socket, next) => {
      this.autenticar(socket).then(
        () => next(),
        (err: unknown) => {
          const motivo = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Conexión WebSocket rechazada (${motivo}): ${socket.id}`);
          next(new Error('No autorizado'));
        },
      );
    });
  }

  private async autenticar(socket: Socket): Promise<void> {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) throw new Error('falta el token');
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    // Igual que en REST (JwtStrategy): la sede sale de la base, no del
    // token, para que un cambio de sede en /usuarios aplique al reconectar.
    const usuario = await cargarUsuarioVigente(this.prisma, payload);
    if (!usuario) throw new Error('usuario inactivo o inexistente');
    const datos: DatosSocket = { cadenaId: usuario.cadenaId, sedeId: usuario.sedeId };
    Object.assign(socket.data, datos);
  }

  handleConnection(client: Socket) {
    // Fase 9: a diferencia de `sede:unirse` (que exige elegir una sede),
    // todo socket autenticado se une de una vez a la room de su propia
    // cadena — ahí solo se emiten agregados de venta (`venta:registrada`),
    // que no filtran nada específico de una sede en particular. Sin await:
    // el join es local a la instancia (también con el adaptador de Redis),
    // así la room queda lista antes de atender el primer evento del cliente.
    const { cadenaId } = client.data as DatosSocket;
    void client.join(nombreRoomCadena(cadenaId));
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Cliente desconectado: ${client.id}`);
  }

  // Responde { ok } como acuse cuando el cliente lo pide (emitWithAck), para
  // que sepa si quedó en la room; sin acuse, se comporta igual que antes.
  @SubscribeMessage('sede:unirse')
  async unirseASede(@ConnectedSocket() client: Socket, @MessageBody() data: { sedeId?: unknown }) {
    const { cadenaId, sedeId: sedeAsignada } = client.data as DatosSocket;
    const sedeId = typeof data?.sedeId === 'string' ? data.sedeId : null;
    const sede = sedeId ? await this.prisma.sede.findUnique({ where: { id: sedeId } }) : null;
    // Fase 17: con sede asignada, solo la suya.
    const sedeAjena = Boolean(sedeAsignada) && sedeAsignada !== sedeId;
    if (!sede || sede.cadenaId !== cadenaId || sedeAjena) {
      this.logger.warn(`Intento de unirse a una sede ajena: ${client.id} -> ${String(sedeId)}`);
      return { ok: false };
    }
    await client.join(nombreRoomSede(sede.id));
    return { ok: true };
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

  // Llamado por PaymentsService después de cada cobro. Lo escucha el panel
  // consolidado del dueño (/panel, Fase 9, CU-06) para actualizarse en vivo
  // sin tener que recargar ni hacer polling.
  emitirVentaRegistrada(cadenaId: string, venta: unknown) {
    this.server.to(nombreRoomCadena(cadenaId)).emit('venta:registrada', venta);
  }

  // Llamado por CatalogService al crear/editar/desactivar un producto (y por
  // ImagenesProductoService al cambiar la foto). Lo escucha /mesas (Fase 10,
  // CU-08) para refrescar el catálogo sin recargar. El menú QR público no
  // abre socket: muestra el cambio la próxima vez que se carga.
  emitirCatalogoActualizado(cadenaId: string, evento: unknown) {
    this.server.to(nombreRoomCadena(cadenaId)).emit('catalogo:actualizado', evento);
  }

  // Llamado por InventoryService tras un movimiento manual (ENTRADA/MERMA) o
  // por OrdersService tras el descuento automático al crear un pedido
  // (SALIDA; PaymentsService solo en pedidos viejos). Lo escucha
  // /inventario (Fase 11, §6.2) para refrescar existencias sin recargar.
  emitirInventarioActualizado(cadenaId: string, evento: unknown) {
    this.server.to(nombreRoomCadena(cadenaId)).emit('inventario:actualizado', evento);
  }

  // Llamado por FiscalEventosService cuando el worker termina de validar un
  // documento (Fase 11B). Lo escucha /caja para mostrar el estado DIAN en vivo.
  // `local`: a diferencia de los demás eventos, este no nace de una petición
  // atendida por una sola instancia sino del evento de la cola, que reciben
  // todas (Fase 13B). Si se reenviara por el backplane de Redis, cada caja lo
  // recibiría una vez por instancia.
  emitirDocumentoActualizado(sedeId: string, documento: unknown) {
    this.server.local.to(nombreRoomSede(sedeId)).emit('documento:actualizado', documento);
  }
}
