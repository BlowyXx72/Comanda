import { apiFetch } from './client';

export interface Sede {
  id: string;
  cadenaId: string;
  nombre: string;
  direccion: string;
  rangoNumeracion: string;
}

export type EstadoMesa = 'LIBRE' | 'OCUPADA';

export interface Mesa {
  id: string;
  sedeId: string;
  numero: number;
  estado: EstadoMesa;
}

export interface Producto {
  id: string;
  cadenaId: string;
  nombre: string;
  // Prisma serializa Decimal como string en el JSON.
  precio: string;
  categoria: string;
}

export interface PedidoDetalle {
  id: string;
  pedidoId: string;
  productoId: string;
  cantidad: number;
  precioUnitario: string;
  notas: string | null;
  producto: Producto;
}

export type EstadoPedido = 'ABIERTO' | 'EN_PREPARACION' | 'LISTO' | 'PAGADO';

export interface Pedido {
  id: string;
  sedeId: string;
  mesaId: string | null;
  usuarioId: string;
  canal: string;
  estado: EstadoPedido;
  fechaHora: string;
  total: string;
  mesa?: Mesa | null;
  detalles: PedidoDetalle[];
}

export interface CrearPedidoDetalleInput {
  productoId: string;
  cantidad: number;
  notas?: string;
}

export interface CrearPedidoInput {
  id: string;
  sedeId: string;
  mesaId?: string;
  detalles: CrearPedidoDetalleInput[];
}

export const listarSedes = (token: string) => apiFetch<Sede[]>('/sedes', {}, token);

export const listarMesas = (sedeId: string, token: string) => apiFetch<Mesa[]>(`/sedes/${sedeId}/mesas`, {}, token);

export const listarProductos = (token: string) => apiFetch<Producto[]>('/productos', {}, token);

export const crearPedido = (input: CrearPedidoInput, token: string) =>
  apiFetch<Pedido>('/pedidos', { method: 'POST', body: JSON.stringify(input) }, token);

export const listarPedidosActivos = (sedeId: string, token: string) =>
  apiFetch<Pedido[]>(`/pedidos?sedeId=${sedeId}`, {}, token);

export const actualizarEstadoPedido = (id: string, estado: EstadoPedido, token: string) =>
  apiFetch<Pedido>(`/pedidos/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) }, token);
