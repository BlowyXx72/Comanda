import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { crearPago, listarPedidosActivos, type MedioPago, type Pedido, type ResultadoPago } from '../api/comanda';
import { useAuth } from '../auth/AuthContext';
import { useSedeActual } from '../hooks/useSedeActual';
import { useComandaSocket } from '../realtime/useComandaSocket';
import { etiquetaPedido, formatearCOP } from '../utils/formato';

export function CajaPage() {
  const { token } = useAuth();
  const { sede, cargando: cargandoSede, error: errorSede } = useSedeActual();

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pedidoACobrar, setPedidoACobrar] = useState<Pedido | null>(null);
  const [medio, setMedio] = useState<MedioPago>('EFECTIVO');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recibo, setRecibo] = useState<ResultadoPago | null>(null);

  const cargarPedidos = () => {
    if (!token || !sede) return;
    listarPedidosActivos(sede.id, token).then(setPedidos);
  };

  useEffect(cargarPedidos, [token, sede]);

  useComandaSocket({
    token,
    sedeId: sede?.id ?? null,
    onComandaNueva: (pedido) => setPedidos((prev) => (prev.some((p) => p.id === pedido.id) ? prev : [...prev, pedido])),
    onPedidoActualizado: (pedido) => {
      setPedidos((prev) => {
        // Un pedido PAGADO ya no es "activo": lo quitamos del tablero de caja.
        if (pedido.estado === 'PAGADO') return prev.filter((p) => p.id !== pedido.id);
        return prev.map((p) => (p.id === pedido.id ? pedido : p));
      });
    },
  });

  const abrirCobro = (pedido: Pedido) => {
    setPedidoACobrar(pedido);
    setMedio('EFECTIVO');
    setError(null);
    setRecibo(null);
  };

  const confirmarCobro = async () => {
    if (!token || !pedidoACobrar) return;
    setEnviando(true);
    setError(null);
    try {
      const resultado = await crearPago(
        { pedidoId: pedidoACobrar.id, medio, monto: Number(pedidoACobrar.total) },
        token,
      );
      setRecibo(resultado);
      setPedidoACobrar(null);
      cargarPedidos();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar el pago');
    } finally {
      setEnviando(false);
    }
  };

  if (cargandoSede) return <p className="pantalla-info">Cargando sede…</p>;
  if (errorSede || !sede) return <p className="pantalla-info">No se pudo cargar la sede.</p>;

  const listos = pedidos.filter((p) => p.estado === 'LISTO');
  const enPreparacion = pedidos.filter((p) => p.estado === 'EN_PREPARACION');

  return (
    <div className="caja-page">
      <h1>Caja — {sede.nombre}</h1>

      <section>
        <h2>Listos para cobrar</h2>
        {listos.length === 0 && <p className="pantalla-info">No hay pedidos listos para cobrar.</p>}
        <div className="comandas-grid">
          {listos.map((pedido) => (
            <div key={pedido.id} className="comanda-card comanda-card--listo">
              <div className="comanda-card-header">
                <strong>{etiquetaPedido(pedido)}</strong>
                <span className="comanda-badge">{formatearCOP(pedido.total)}</span>
              </div>
              {pedido.cliente && (
                <p className="panel-nota">
                  {pedido.cliente.nombre} · {pedido.cliente.telefono} · {pedido.cliente.direccion}
                </p>
              )}
              <ul className="lista-items">
                {pedido.detalles.map((detalle) => (
                  <li key={detalle.id}>
                    {detalle.cantidad}× {detalle.producto.nombre}
                  </li>
                ))}
              </ul>
              <button onClick={() => abrirCobro(pedido)}>Cobrar</button>
            </div>
          ))}
        </div>
      </section>

      {enPreparacion.length > 0 && (
        <section>
          <h2>Aún en cocina</h2>
          <div className="comandas-grid">
            {enPreparacion.map((pedido) => (
              <div key={pedido.id} className="comanda-card comanda-card--en_preparacion">
                <div className="comanda-card-header">
                  <strong>{etiquetaPedido(pedido)}</strong>
                  <span className="comanda-badge">{pedido.estado}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {pedidoACobrar && (
        <div className="panel-pedido">
          <div className="panel-pedido-header">
            <h2>Cobrar {etiquetaPedido(pedidoACobrar)}</h2>
            <button onClick={() => setPedidoACobrar(null)}>Cerrar</button>
          </div>
          <p className="carrito-total">Total: {formatearCOP(pedidoACobrar.total)}</p>
          <div className="medio-pago">
            <label>
              <input
                type="radio"
                name="medio"
                checked={medio === 'EFECTIVO'}
                onChange={() => setMedio('EFECTIVO')}
              />
              Efectivo
            </label>
            <label>
              <input type="radio" name="medio" checked={medio === 'TARJETA'} onChange={() => setMedio('TARJETA')} />
              Tarjeta
            </label>
          </div>
          {error && <p className="login-error">{error}</p>}
          <button disabled={enviando} onClick={confirmarCobro}>
            {enviando ? 'Cobrando…' : 'Confirmar cobro'}
          </button>
        </div>
      )}

      {recibo && (
        <div className="panel-pedido recibo">
          <div className="panel-pedido-header">
            <h2>Documento fiscal simulado</h2>
            <button onClick={() => setRecibo(null)}>Cerrar</button>
          </div>
          <p>
            <strong>{recibo.documentoFiscal.tipo}</strong> N.° {recibo.documentoFiscal.consecutivo}
          </p>
          <p className="panel-nota">
            Estado DIAN: {recibo.documentoFiscal.estadoDian} — documento simulado, sin envío real a la DIAN.
          </p>
          <ul className="lista-items">
            {recibo.pedido.detalles.map((detalle) => (
              <li key={detalle.id}>
                {detalle.cantidad}× {detalle.producto.nombre} —{' '}
                {formatearCOP(Number(detalle.precioUnitario) * detalle.cantidad)}
              </li>
            ))}
          </ul>
          <p className="carrito-total">
            Total pagado ({recibo.pago.medio}): {formatearCOP(recibo.pago.monto)}
          </p>
        </div>
      )}
    </div>
  );
}
