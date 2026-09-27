import { useEffect, useMemo, useState } from 'react';
import {
  crearPedido,
  listarMesas,
  listarPedidosActivos,
  listarProductos,
  type Mesa,
  type Pedido,
  type Producto,
} from '../api/comanda';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useSedeActual } from '../hooks/useSedeActual';
import { useComandaSocket } from '../realtime/useComandaSocket';
import { formatearCOP } from '../utils/formato';

interface ItemCarrito {
  producto: Producto;
  cantidad: number;
  notas: string;
}

export function MesasPage() {
  const { token } = useAuth();
  const { sede, cargando: cargandoSede, error: errorSede } = useSedeActual();

  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedidosActivos, setPedidosActivos] = useState<Pedido[]>([]);
  const [mesaSeleccionada, setMesaSeleccionada] = useState<Mesa | null>(null);
  const [carrito, setCarrito] = useState<Record<string, ItemCarrito>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarMesas = async () => {
    if (!token || !sede) return;
    const [mesasRes, pedidosRes] = await Promise.all([
      listarMesas(sede.id, token),
      listarPedidosActivos(sede.id, token),
    ]);
    setMesas(mesasRes);
    setPedidosActivos(pedidosRes);
  };

  const cargarProductos = () => {
    if (!token) return;
    listarProductos(token).then(setProductos).catch(() => undefined);
  };

  useEffect(() => {
    if (!token || !sede) return;
    cargarProductos();
    cargarMesas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sede]);

  useComandaSocket({
    token,
    sedeId: sede?.id ?? null,
    onComandaNueva: () => cargarMesas(),
    onPedidoActualizado: () => cargarMesas(),
    // Fase 10 (CU-08): ADMIN crea/edita/desactiva un producto desde
    // /catalogo y el mesero ve el catálogo actualizado sin recargar.
    onCatalogoActualizado: () => cargarProductos(),
  });

  const pedidoDeMesa = (mesa: Mesa) => pedidosActivos.find((p) => p.mesaId === mesa.id);

  const abrirMesa = (mesa: Mesa) => {
    setError(null);
    setCarrito({});
    setMesaSeleccionada(mesa);
  };

  const cerrarPanel = () => {
    setMesaSeleccionada(null);
    setCarrito({});
    setError(null);
  };

  const agregarProducto = (producto: Producto) => {
    setCarrito((prev) => {
      const actual = prev[producto.id];
      return {
        ...prev,
        [producto.id]: { producto, cantidad: (actual?.cantidad ?? 0) + 1, notas: actual?.notas ?? '' },
      };
    });
  };

  const quitarProducto = (productoId: string) => {
    setCarrito((prev) => {
      const actual = prev[productoId];
      if (!actual) return prev;
      if (actual.cantidad <= 1) {
        const { [productoId]: _omitido, ...resto } = prev;
        return resto;
      }
      return { ...prev, [productoId]: { ...actual, cantidad: actual.cantidad - 1 } };
    });
  };

  const cambiarNotas = (productoId: string, notas: string) => {
    setCarrito((prev) => (prev[productoId] ? { ...prev, [productoId]: { ...prev[productoId], notas } } : prev));
  };

  const itemsCarrito = Object.values(carrito);
  const totalCarrito = useMemo(
    () => itemsCarrito.reduce((acc, item) => acc + Number(item.producto.precio) * item.cantidad, 0),
    [itemsCarrito],
  );

  const enviarComanda = async () => {
    if (!token || !sede || !mesaSeleccionada || itemsCarrito.length === 0) return;
    setEnviando(true);
    setError(null);
    try {
      await crearPedido(
        {
          id: crypto.randomUUID(),
          sedeId: sede.id,
          mesaId: mesaSeleccionada.id,
          detalles: itemsCarrito.map((item) => ({
            productoId: item.producto.id,
            cantidad: item.cantidad,
            notas: item.notas || undefined,
          })),
        },
        token,
      );
      cerrarPanel();
      await cargarMesas();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la comanda');
    } finally {
      setEnviando(false);
    }
  };

  if (cargandoSede) return <p className="pantalla-info">Cargando sede…</p>;
  if (errorSede || !sede) return <p className="pantalla-info">No se pudo cargar la sede.</p>;

  const pedidoSeleccionado = mesaSeleccionada?.estado === 'OCUPADA' ? pedidoDeMesa(mesaSeleccionada) : undefined;

  return (
    <div className="mesas-page">
      <h1>Mesas — {sede.nombre}</h1>

      <div className="mesas-grid">
        {mesas.map((mesa) => (
          <button
            key={mesa.id}
            className={`mesa-card mesa-card--${mesa.estado.toLowerCase()}`}
            onClick={() => abrirMesa(mesa)}
          >
            <span className="mesa-numero">Mesa {mesa.numero}</span>
            <span className="mesa-estado">{mesa.estado}</span>
          </button>
        ))}
      </div>

      {mesaSeleccionada && (
        <div className="panel-pedido">
          <div className="panel-pedido-header">
            <h2>Mesa {mesaSeleccionada.numero}</h2>
            <button onClick={cerrarPanel}>Cerrar</button>
          </div>

          {mesaSeleccionada.estado === 'OCUPADA' ? (
            <div>
              <p className="panel-nota">Esta mesa ya tiene una comanda activa (solo lectura).</p>
              {pedidoSeleccionado ? (
                <ul className="lista-items">
                  {pedidoSeleccionado.detalles.map((detalle) => (
                    <li key={detalle.id}>
                      {detalle.cantidad}× {detalle.producto.nombre}
                      {detalle.notas && <em> — {detalle.notas}</em>}
                    </li>
                  ))}
                  <li className="lista-items-estado">Estado: {pedidoSeleccionado.estado}</li>
                </ul>
              ) : (
                <p>No se encontró el detalle del pedido.</p>
              )}
            </div>
          ) : (
            <div className="armador-pedido">
              <div className="lista-productos">
                {productos.map((producto) => (
                  <button key={producto.id} className="producto-boton" onClick={() => agregarProducto(producto)}>
                    <span>{producto.nombre}</span>
                    <span>{formatearCOP(producto.precio)}</span>
                  </button>
                ))}
              </div>

              <div className="carrito">
                <h3>Carrito</h3>
                {itemsCarrito.length === 0 && <p className="panel-nota">Toca un producto para agregarlo.</p>}
                <ul className="lista-items">
                  {itemsCarrito.map((item) => (
                    <li key={item.producto.id} className="carrito-item">
                      <div className="carrito-item-linea">
                        <span>
                          {item.cantidad}× {item.producto.nombre}
                        </span>
                        <div className="carrito-item-acciones">
                          <button onClick={() => quitarProducto(item.producto.id)}>−</button>
                          <button onClick={() => agregarProducto(item.producto)}>+</button>
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Notas (opcional)"
                        value={item.notas}
                        onChange={(e) => cambiarNotas(item.producto.id, e.target.value)}
                      />
                    </li>
                  ))}
                </ul>

                {itemsCarrito.length > 0 && <p className="carrito-total">Total: {formatearCOP(totalCarrito)}</p>}
                {error && <p className="login-error">{error}</p>}

                <button disabled={itemsCarrito.length === 0 || enviando} onClick={enviarComanda}>
                  {enviando ? 'Enviando…' : 'Enviar comanda'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
