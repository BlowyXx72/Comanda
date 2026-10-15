import { apiFetch, apiFetchTexto } from './client';

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
  // null en pedidos de domicilio (los crea un Cliente, no un Usuario).
  usuarioId: string | null;
  clienteId?: string | null;
  canal: string;
  estado: EstadoPedido;
  fechaHora: string;
  total: string;
  mesa?: Mesa | null;
  cliente?: Cliente | null;
  // Fase 12B: id del pedido en la plataforma (solo canal PLATAFORMA).
  referenciaExterna?: string | null;
  detalles: PedidoDetalle[];
}

export interface Cliente {
  id: string;
  cadenaId: string;
  nombre: string;
  telefono: string;
  direccion: string;
  // Fase 14B: opcional, para enviarle el comprobante por correo.
  email?: string | null;
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
  estadoDian: EstadoDian;
  urlXml: string | null;
  // Fase 11B: respuesta del proveedor DIAN simulado y hora de validación.
  mensajeDian?: string | null;
  validadoEn?: string | null;
  creadoEn: string;
}

// SIMULADO = cobrado antes de la Fase 11B; los demás los pone el worker.
export type EstadoDian = 'SIMULADO' | 'PENDIENTE' | 'VALIDADO_SIMULADO' | 'RECHAZADO_SIMULADO';

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
  cliente: { nombre: string; telefono: string; direccion: string; email?: string };
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

// --- Operación sin conexión (CU-07): el mesero vacía su cola local ---

export type ResultadoSync =
  | { id: string; resultado: 'CREADO' | 'DUPLICADO' }
  | { id: string; resultado: 'RECHAZADO'; motivo: string };

export const sincronizarPedidos = (pedidos: CrearPedidoInput[], token: string) =>
  apiFetch<ResultadoSync[]>('/sync', { method: 'POST', body: JSON.stringify({ pedidos }) }, token);

// --- Inventario y recetas (Fase 11, §6.2) ---

export interface Insumo {
  id: string;
  cadenaId: string;
  nombre: string;
  unidad: string;
  // Prisma serializa Decimal como string en el JSON.
  costoUnitario: string;
}

export interface ExistenciaInsumo extends Insumo {
  existencia: string;
}

export interface CrearInsumoInput {
  nombre: string;
  unidad: string;
  costoUnitario: number;
}

export interface ActualizarInsumoInput {
  nombre?: string;
  unidad?: string;
  costoUnitario?: number;
}

export type TipoMovimientoManual = 'ENTRADA' | 'MERMA';

export interface CrearMovimientoInput {
  sedeId: string;
  insumoId: string;
  tipo: TipoMovimientoManual;
  cantidad: number;
}

export interface MovimientoInventario {
  id: string;
  sedeId: string;
  insumoId: string;
  tipo: TipoMovimientoManual | 'SALIDA';
  cantidad: string;
  fecha: string;
}

export interface ItemRecetaInput {
  insumoId: string;
  cantidad: number;
}

export interface ItemReceta {
  productoId: string;
  insumoId: string;
  cantidad: string;
  insumo: Insumo;
}

export const listarInsumos = (token: string) => apiFetch<Insumo[]>('/insumos', {}, token);

export const crearInsumo = (input: CrearInsumoInput, token: string) =>
  apiFetch<Insumo>('/insumos', { method: 'POST', body: JSON.stringify(input) }, token);

export const actualizarInsumo = (id: string, input: ActualizarInsumoInput, token: string) =>
  apiFetch<Insumo>(`/insumos/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token);

export const obtenerExistenciasSede = (sedeId: string, token: string) =>
  apiFetch<ExistenciaInsumo[]>(`/sedes/${sedeId}/inventario`, {}, token);

export const registrarMovimientoInventario = (input: CrearMovimientoInput, token: string) =>
  apiFetch<MovimientoInventario>('/inventario/movimientos', { method: 'POST', body: JSON.stringify(input) }, token);

export const listarReceta = (productoId: string, token: string) =>
  apiFetch<ItemReceta[]>(`/productos/${productoId}/receta`, {}, token);

export const reemplazarReceta = (productoId: string, items: ItemRecetaInput[], token: string) =>
  apiFetch<ItemReceta[]>(
    `/productos/${productoId}/receta`,
    { method: 'PUT', body: JSON.stringify({ items }) },
    token,
  );

// --- Documento fiscal en segundo plano (Fase 11B) ---

// Payload de `documento:actualizado` (room sede:{id}).
export interface DocumentoActualizado {
  documentoFiscalId: string;
  pedidoId: string;
  sedeId: string;
  estadoDian: EstadoDian;
  urlXml: string | null;
  mensajeDian: string | null;
}

export const descargarXmlDocumento = (documentoFiscalId: string, token: string) =>
  apiFetchTexto(`/documentos-fiscales/${documentoFiscalId}/xml`, token);

// --- Plataforma de domicilios simulada (Fase 12B, CU-05) ---
// Las usa solo /simulador-plataforma, que hace de sistema externo: se
// autentica con X-Api-Key en vez de JWT y habla el formato de la plataforma.

const conApiKey = (apiKey: string): RequestInit['headers'] => ({ 'X-Api-Key': apiKey });

export interface CatalogoPlataforma {
  plataforma: string;
  sedes: { id: string; nombre: string; direccion: string }[];
  productos: { id: string; nombre: string; precio: string; categoria: string }[];
}

export interface PedidoPlataformaInput {
  orderId: string;
  storeId: string;
  customer: { name: string; phone: string; address: string };
  items: { sku: string; qty: number; comment?: string }[];
}

export interface RespuestaPedidoPlataforma {
  orderId: string;
  externalId: string;
  status: EstadoPedido;
  total: string;
  duplicate: boolean;
}

export interface AcusePlataforma {
  recibidoEn: string;
  cuerpo: { orderId: string; externalId: string; status: string; store: string; total: string; acceptedAt: string };
}

export const obtenerCatalogoPlataforma = (apiKey: string) =>
  apiFetch<CatalogoPlataforma>('/integraciones/plataformas/catalogo', { headers: conApiKey(apiKey) });

export const enviarPedidoPlataforma = (input: PedidoPlataformaInput, apiKey: string) =>
  apiFetch<RespuestaPedidoPlataforma>('/integraciones/plataformas/pedidos', {
    method: 'POST',
    headers: conApiKey(apiKey),
    body: JSON.stringify(input),
  });

export const listarAcusesPlataforma = (apiKey: string) =>
  apiFetch<AcusePlataforma[]>('/simulador-plataforma/acuses', { headers: conApiKey(apiKey) });

// --- Correo (Fase 14B) ---

export const enviarResumenDiario = (token: string, fecha?: string) =>
  apiFetch<{ encolado: boolean }>('/correo/resumen-diario', { method: 'POST', body: JSON.stringify({ fecha }) }, token);
