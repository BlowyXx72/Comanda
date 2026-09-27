import { useEffect, useState } from 'react';
import { actualizarEstadoPedido, listarPedidosActivos, type Pedido } from '../api/comanda';
import { useAuth } from '../auth/AuthContext';
import { useSedeActual } from '../hooks/useSedeActual';
import { useComandaSocket } from '../realtime/useComandaSocket';
import { etiquetaPedido } from '../utils/formato';

export function CocinaPage() {
  const { token } = useAuth();
  const { sede, cargando: cargandoSede, error: errorSede } = useSedeActual();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  useEffect(() => {
    if (!token || !sede) return;
    listarPedidosActivos(sede.id, token).then(setPedidos);
  }, [token, sede]);

  const upsertPedido = (pedido: Pedido) => {
    setPedidos((prev) => {
      const existe = prev.some((p) => p.id === pedido.id);
      if (existe) {
        return prev.map((p) => (p.id === pedido.id ? pedido : p));
      }
      return [...prev, pedido];
    });
  };

  useComandaSocket({
    token,
    sedeId: sede?.id ?? null,
    onComandaNueva: upsertPedido,
    onPedidoActualizado: upsertPedido,
  });

  const marcarListo = async (pedido: Pedido) => {
    if (!token) return;
    try {
      const actualizado = await actualizarEstadoPedido(pedido.id, 'LISTO', token);
      upsertPedido(actualizado);
    } catch {
      // DECISIÓN DE PROTOTIPO: sin toast de errores en el KDS; el estado
      // simplemente no cambia y el mesero/cajero puede reintentar.
    }
  };

  if (cargandoSede) return <p className="pantalla-info">Cargando sede…</p>;
  if (errorSede || !sede) return <p className="pantalla-info">No se pudo cargar la sede.</p>;

  const pedidosOrdenados = [...pedidos].sort(
    (a, b) => new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime(),
  );

  return (
    <div className="cocina-page">
      <h1>Cocina — {sede.nombre}</h1>

      {pedidosOrdenados.length === 0 && <p className="pantalla-info">No hay comandas activas.</p>}

      <div className="comandas-grid">
        {pedidosOrdenados.map((pedido) => (
          <div key={pedido.id} className={`comanda-card comanda-card--${pedido.estado.toLowerCase()}`}>
            <div className="comanda-card-header">
              <strong>{etiquetaPedido(pedido)}</strong>
              <span className="comanda-badge">{pedido.estado}</span>
            </div>
            {pedido.cliente && <p className="panel-nota">{pedido.cliente.nombre}</p>}
            <ul className="lista-items">
              {pedido.detalles.map((detalle) => (
                <li key={detalle.id}>
                  {detalle.cantidad}× {detalle.producto.nombre}
                  {detalle.notas && <em> — {detalle.notas}</em>}
                </li>
              ))}
            </ul>
            {pedido.estado === 'EN_PREPARACION' && <button onClick={() => marcarListo(pedido)}>Marcar LISTO</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
