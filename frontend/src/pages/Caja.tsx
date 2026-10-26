import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import {
  crearPago,
  descargarXmlDocumento,
  listarPedidosActivos,
  type EstadoDian,
  type MedioPago,
  type Pedido,
  type ResultadoPago,
} from '../api/comanda';
import { useAuth } from '../auth/AuthContext';
import type { CobroPendiente } from '../caja-offline/db';
import { useCobroOffline } from '../caja-offline/useCobroOffline';
import { conRespaldo, esErrorDeRed } from '../offline/cache';
import { useSedeConRespaldo } from '../offline/useSedeConRespaldo';
import { useComandaSocket } from '../realtime/useComandaSocket';
import { etiquetaPedido, textoEstadoPedido, formatearCOP } from '../utils/formato';

const TEXTO_ESTADO_DIAN: Record<EstadoDian, string> = {
  SIMULADO: 'Simulado (cobrado antes de la cola fiscal)',
  PENDIENTE: 'Validando con la DIAN (simulada) en segundo plano…',
  VALIDADO_SIMULADO: 'Validado (simulado)',
  RECHAZADO_SIMULADO: 'Rechazado (simulado)',
};

export function CajaPage() {
  const { token } = useAuth();
  // Fase 16 (CU-07): la caja abre sin conexión con la última sede guardada.
  const { sede, cargando: cargandoSede, error: errorSede } = useSedeConRespaldo();

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pedidoACobrar, setPedidoACobrar] = useState<Pedido | null>(null);
  const [medio, setMedio] = useState<MedioPago>('EFECTIVO');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recibo, setRecibo] = useState<ResultadoPago | null>(null);
  // Fase 16: recibo provisional de un cobro hecho sin conexión.
  const [reciboOffline, setReciboOffline] = useState<CobroPendiente | null>(null);

  const cargarPedidos = () => {
    if (!token || !sede) return;
    // Sin red se muestran los últimos pedidos guardados (misma clave que /mesas).
    conRespaldo(`pedidos:${sede.id}`, () => listarPedidosActivos(sede.id, token))
      .then(setPedidos)
      .catch(() => undefined);
  };

  useEffect(cargarPedidos, [token, sede]);

  const cobroOffline = useCobroOffline(token, sede?.id ?? null, etiquetaPedido, cargarPedidos);

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
    // Fase 11B: el cobro ya respondió con el documento PENDIENTE; el worker
    // avisa aquí cuando termina de validarlo.
    onDocumentoActualizado: (doc) =>
      setRecibo((prev) =>
        prev && prev.documentoFiscal.id === doc.documentoFiscalId
          ? {
              ...prev,
              documentoFiscal: {
                ...prev.documentoFiscal,
                estadoDian: doc.estadoDian,
                urlXml: doc.urlXml,
                mensajeDian: doc.mensajeDian,
              },
            }
          : prev,
      ),
  });

  const verXml = async () => {
    if (!token || !recibo) return;
    try {
      const xml = await descargarXmlDocumento(recibo.documentoFiscal.id, token);
      const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo descargar el XML');
    }
  };

  const abrirCobro = (pedido: Pedido) => {
    setPedidoACobrar(pedido);
    setMedio('EFECTIVO');
    setError(null);
    setRecibo(null);
    setReciboOffline(null);
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
      if (esErrorDeRed(err)) {
        await cobrarSinConexion(pedidoACobrar);
      } else {
        setError(err instanceof ApiError ? err.message : 'No se pudo registrar el pago');
      }
    } finally {
      setEnviando(false);
    }
  };

  // Fase 16 (CU-07): sin red, el cobro se numera con el bloque reservado por
  // esta caja y queda en la cola local hasta que vuelva la conexión.
  const cobrarSinConexion = async (pedido: Pedido) => {
    const cobro = await cobroOffline.cobrarSinConexion(pedido, medio).catch(() => null);
    if (!cobro) {
      setError('Sin conexión y sin numeración fiscal reservada en esta caja: no se puede cobrar hasta que vuelva la red.');
      return;
    }
    setReciboOffline(cobro);
    setPedidoACobrar(null);
  };

  if (cargandoSede) return <p className="pantalla-info">Cargando sede…</p>;
  if (errorSede || !sede) return <p className="pantalla-info">No se pudo cargar la sede.</p>;

  // Un pedido cobrado sin conexión ya no se ofrece para cobrar otra vez.
  const cobradosSinConexion = new Set(cobroOffline.pendientes.map((c) => c.pago.pedidoId));
  const listos = pedidos.filter((p) => p.estado === 'LISTO' && !cobradosSinConexion.has(p.id));
  const nPendientes = cobroOffline.pendientes.length;
  const textoPendientes = `${nPendientes} ${nPendientes === 1 ? 'cobro pendiente' : 'cobros pendientes'}`;
  const enPreparacion = pedidos.filter((p) => p.estado === 'EN_PREPARACION');

  return (
    <div className="caja-page">
      <h1>Caja — {sede.nombre}</h1>

      {(!cobroOffline.enLinea || nPendientes > 0) && (
        <div className={`banner-offline${cobroOffline.enLinea ? ' banner-offline--sincronizando' : ''}`}>
          <span>
            {!cobroOffline.enLinea
              ? `Sin conexión — ${textoPendientes} · ${cobroOffline.disponibles} números fiscales reservados`
              : cobroOffline.sincronizando
                ? `Sincronizando ${textoPendientes}…`
                : `${textoPendientes} de sincronizar`}
          </span>
          {cobroOffline.enLinea && !cobroOffline.sincronizando && nPendientes > 0 && (
            <button onClick={() => cobroOffline.sincronizar()}>Sincronizar ahora</button>
          )}
        </div>
      )}
      {cobroOffline.errorSync && <p className="login-error">No se pudo sincronizar: {cobroOffline.errorSync}</p>}
      {cobroOffline.rechazados.length > 0 && (
        <div className="banner-offline banner-offline--rechazo">
          <ul className="lista-items">
            {cobroOffline.rechazados.map((r) => (
              <li key={r.id}>
                Cobro N.° {r.consecutivo} ({r.etiqueta}) rechazado al sincronizar: {r.motivo}
              </li>
            ))}
          </ul>
          <button onClick={cobroOffline.descartarRechazados}>Entendido</button>
        </div>
      )}

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
                  <span className="comanda-badge">{textoEstadoPedido(pedido.estado)}</span>
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

      {reciboOffline && (
        <div className="panel-pedido recibo">
          <div className="panel-pedido-header">
            <h2>Cobro sin conexión</h2>
            <button onClick={() => setReciboOffline(null)}>Cerrar</button>
          </div>
          <p>
            <strong>FACTURA</strong> N.° {reciboOffline.pago.consecutivo}
          </p>
          <p className="estado-dian estado-dian--pendiente">
            Pendiente de sincronizar: se enviará a la DIAN (simulada) cuando vuelva la conexión.
          </p>
          <p className="panel-nota">Documento simulado, sin envío real a la DIAN.</p>
          <ul className="lista-items">
            {reciboOffline.pedido.detalles.map((detalle) => (
              <li key={detalle.id}>
                {detalle.cantidad}× {detalle.producto.nombre} —{' '}
                {formatearCOP(Number(detalle.precioUnitario) * detalle.cantidad)}
              </li>
            ))}
          </ul>
          <p className="carrito-total">
            Total pagado ({reciboOffline.pago.medio}): {formatearCOP(reciboOffline.pago.monto)}
          </p>
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
          <p className={`estado-dian estado-dian--${recibo.documentoFiscal.estadoDian.toLowerCase()}`}>
            Estado DIAN: {TEXTO_ESTADO_DIAN[recibo.documentoFiscal.estadoDian]}
          </p>
          {recibo.documentoFiscal.mensajeDian && <p className="panel-nota">{recibo.documentoFiscal.mensajeDian}</p>}
          <p className="panel-nota">Documento simulado, sin envío real a la DIAN.</p>
          {recibo.documentoFiscal.urlXml && <button onClick={verXml}>Ver XML</button>}
          {error && <p className="login-error">{error}</p>}
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
