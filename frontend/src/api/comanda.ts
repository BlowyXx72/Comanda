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
  // null en pedidos de domicilio (los crea un Cliente, no un Usuario).
  usuarioId: string | null;
  clienteId?: string | null;
  canal: string;
  estado: EstadoPedido;
  fechaHora: string;
  total: string;
  mesa?: Mesa | null;
  cliente?: Cliente | null;
  detalles: PedidoDetalle[];
}

export interface Cliente {
  id: string;
  cadenaId: string;
  nombre: string;
  telefono: string;
  direccion: string;
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

export type MedioPago = 'EFECTIVO' | 'TARJETA';

export interface Pago {
  id: string;
  pedidoId: string;
  medio: MedioPago;
  monto: string;
  creadoEn: string;
}

export interface DocumentoFiscal {
  id: string;
  pedidoId: string;
  sedeId: string;
  tipo: string;
  consecutivo: number;
  estadoDian: string;
  urlXml: string | null;
  creadoEn: string;
}

export interface ResultadoPago {
  pago: Pago;
  documentoFiscal: DocumentoFiscal;
  pedido: Pedido;
}

export interface CrearPagoInput {
  pedidoId: string;
  medio: MedioPago;
  monto: number;
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

export const crearPago = (input: CrearPagoInput, token: string) =>
  apiFetch<ResultadoPago>('/pagos', { method: 'POST', body: JSON.stringify(input) }, token);

// --- Menú público (CU-03): sin token, lo consume la vista del comensal ---

export interface ProductoMenu {
  id: string;
  nombre: string;
  precio: string;
}

export interface CategoriaMenu {
  categoria: string;
  productos: ProductoMenu[];
}

export interface MenuPublico {
  sede: { id: string; nombre: string; direccion: string };
  categorias: CategoriaMenu[];
}

export const obtenerMenuPublico = (cadenaId: string, sedeId: string) =>
  apiFetch<MenuPublico>(`/menu/${cadenaId}/${sedeId}`);

// --- Domicilio web (CU-04): sin token, lo envía el cliente desde el menú público ---

export interface CrearPedidoDomicilioInput {
  id: string;
  cadenaId: string;
  sedeId: string;
  cliente: { nombre: string; telefono: string; direccion: string };
  detalles: CrearPedidoDetalleInput[];
}

export interface PedidoDomicilioCreado {
  id: string;
  estado: EstadoPedido;
  total: string;
  fechaHora: string;
}

export const crearPedidoDomicilio = (input: CrearPedidoDomicilioInput) =>
  apiFetch<PedidoDomicilioCreado>('/public/pedidos/domicilio', { method: 'POST', body: JSON.stringify(input) });
