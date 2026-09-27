import { apiFetch } from './client';

export interface Sede {
  id: string;
  cadenaId: string;
  nombre: string;
  direccion: string;
  rangoInicio: number;
  rangoFin: number;
  siguienteConsecutivo: number;
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
  // Fase 10 (CU-08): baja lógica del catálogo centralizado.
  activo: boolean;
}

export interface CrearProductoInput {
  nombre: string;
  precio: number;
  categoria: string;
}

export interface ActualizarProductoInput {
  nombre?: string;
  precio?: number;
  categoria?: string;
  activo?: boolean;
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

export const listarProductos = (token: string, incluirInactivos = false) =>
  apiFetch<Producto[]>(`/productos${incluirInactivos ? '?incluirInactivos=true' : ''}`, {}, token);

// Fase 10 (CU-08): catálogo centralizado, gestionado desde /catalogo (ADMIN).
export const crearProducto = (input: CrearProductoInput, token: string) =>
  apiFetch<Producto>('/productos', { method: 'POST', body: JSON.stringify(input) }, token);

export const actualizarProducto = (id: string, input: ActualizarProductoInput, token: string) =>
  apiFetch<Producto>(`/productos/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token);

export const desactivarProducto = (id: string, token: string) =>
  apiFetch<Producto>(`/productos/${id}`, { method: 'DELETE' }, token);

export const crearPedido = (input: CrearPedidoInput, token: string) =>
  apiFetch<Pedido>('/pedidos', { method: 'POST', body: JSON.stringify(input) }, token);

export const listarPedidosActivos = (sedeId: string, token: string) =>
  apiFetch<Pedido[]>(`/pedidos?sedeId=${sedeId}`, {}, token);

export const actualizarEstadoPedido = (id: string, estado: EstadoPedido, token: string) =>
  apiFetch<Pedido>(`/pedidos/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) }, token);

export const crearPago = (input: CrearPagoInput, token: string) =>
  apiFetch<ResultadoPago>('/pagos', { method: 'POST', body: JSON.stringify(input) }, token);

// Fase 9 (CU-06): panel consolidado del dueño.
export interface FilaReporteConsolidado {
  sedeId: string;
  sedeNombre: string;
  fecha: string;
  canal: string;
  cantidadPedidos: number;
  totalVentas: string;
}

export interface ReporteConsolidado {
  desde: string;
  hasta: string;
  filas: FilaReporteConsolidado[];
  totalGeneral: string;
}

export const obtenerReporteConsolidado = (token: string, desde?: string, hasta?: string) => {
  const params = new URLSearchParams();
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  const query = params.toString();
  return apiFetch<ReporteConsolidado>(`/reportes/consolidado${query ? `?${query}` : ''}`, {}, token);
};
