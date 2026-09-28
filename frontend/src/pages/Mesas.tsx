import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useMemo, useState } from 'react';
import {
  crearPedido,
  type CrearPedidoInput,
  listarMesas,
  listarPedidosActivos,
  listarProductos,
  type Mesa,
  type Pedido,
  type Producto,
} from '../api/comanda';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { conRespaldo, esErrorDeRed } from '../offline/cache';
import { useColaOffline } from '../offline/useColaOffline';
import { useSedeConRespaldo } from '../offline/useSedeConRespaldo';
import { useComandaSocket } from '../realtime/useComandaSocket';
import { formatearCOP } from '../utils/formato';
import { reproducirBeepPedidoListo } from '../utils/sonido';

// Cuánto dura resaltada la mesa cuando cocina marca su pedido LISTO.
const DURACION_ALERTA_MS = 4000;

// DECISIÓN DE PROTOTIPO: el QR se genera en el navegador con `qrcode.react`
// (la propuesta pide el QR por mesa, no cómo generarlo). Apunta a la vista
// pública del menú; VITE_PUBLIC_URL permite usar la IP de la red local para
// escanearlo con un teléfono real (ver .env.example).
const PUBLIC_URL = import.meta.env.VITE_PUBLIC_URL || window.location.origin;

const urlMenuMesa = (cadenaId: string, sedeId: string, numeroMesa: number) =>
  `${PUBLIC_URL}/menu/${cadenaId}/${sedeId}?mesa=${numeroMesa}`;

interface ItemCarrito {
  producto: Producto;
  cantidad: number;
  notas: string;
}

export function MesasPage() {
  const { token } = useAuth();
  const { sede, cargando: cargandoSede, error: errorSede } = useSedeConRespaldo();

  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedidosActivos, setPedidosActivos] = useState<Pedido[]>([]);
  const [mesaSeleccionada, setMesaSeleccionada] = useState<Mesa | null>(null);
  const [carrito, setCarrito] = useState<Record<string, ItemCarrito>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarQr, setMostrarQr] = useState(false);
  // Mesas cuyo pedido acaba de pasar a LISTO en cocina, para resaltarlas en
  // la grilla (ver useComandaSocket → onPedidoActualizado más abajo).
  const [mesasRecienListas, setMesasRecienListas] = useState<Set<string>>(new Set());

  const cargarMesas = async () => {
    if (!token || !sede) return;
    // Sin red se muestran las últimas mesas y pedidos guardados (CU-07).
    const [mesasRes, pedidosRes] = await Promise.all([
      conRespaldo(`mesas:${sede.id}`, () => listarMesas(sede.id, token)),
      conRespaldo(`pedidos:${sede.id}`, () => listarPedidosActivos(sede.id, token)),
    ]);
    setMesas(mesasRes);
    setPedidosActivos(pedidosRes);
  };

  const cargarProductos = () => {
    if (!token || !sede) return;
    // Sin red se usa el último catálogo guardado (CU-07).
    conRespaldo(`productos:${sede.cadenaId}`, () => listarProductos(token))
      .then(setProductos)
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!token || !sede) return;
    cargarProductos();
    cargarMesas().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sede]);

  useComandaSocket({
    token,
    sedeId: sede?.id ?? null,
    onComandaNueva: () => cargarMesas(),
    onPedidoActualizado: (pedido) => {
      cargarMesas();
      // Alerta para el mesero: cocina acaba de marcar este pedido LISTO,
      // hay que ir a recogerlo. Sin esto, el cambio solo se notaba si el
      // mesero tenía la mesa abierta en el panel de detalle.
      if (pedido.estado === 'LISTO' && pedido.mesaId) {
        const mesaId = pedido.mesaId;
        reproducirBeepPedidoListo();
        setMesasRecienListas((prev) => new Set(prev).add(mesaId));
        setTimeout(() => {
          setMesasRecienListas((prev) => {
            const siguiente = new Set(prev);
            siguiente.delete(mesaId);
            return siguiente;
          });
        }, DURACION_ALERTA_MS);
      }
    },
    // Fase 10 (CU-08): ADMIN crea/edita/desactiva un producto desde
    // /catalogo y el mesero ve el catálogo actualizado sin recargar.
    onCatalogoActualizado: () => cargarProductos(),
  });

  const cola = useColaOffline(token, () => cargarMesas().catch(() => undefined));

  // Una mesa con un pedido en la cola local se ve ocupada aunque el backend
  // todavía no lo sepa, para que el mesero no le arme una segunda comanda.
  const pendienteDeMesa = (mesaId: string) => cola.pendientes.find((p) => p.pedido.mesaId === mesaId);
  const mesasVista = mesas.map((mesa) =>
    mesa.estado === 'LIBRE' && pendienteDeMesa(mesa.id) ? { ...mesa, estado: 'OCUPADA' as const } : mesa,
  );

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
    const pedido: CrearPedidoInput = {
      id: crypto.randomUUID(),
      sedeId: sede.id,
      mesaId: mesaSeleccionada.id,
      detalles: itemsCarrito.map((item) => ({
        productoId: item.producto.id,
        cantidad: item.cantidad,
        notas: item.notas || undefined,
      })),
    };
    try {
      if (navigator.onLine) {
        try {
          await crearPedido(pedido, token);
          cerrarPanel();
          await cargarMesas();
          return;
        } catch (err) {
          if (!esErrorDeRed(err)) throw err;
          cola.marcarSinRed();
        }
      }
      // Sin red: el pedido se guarda en la cola local y sale por POST /sync al
      // reconectar. Si la petición sí llegó al backend y solo se perdió la
      // respuesta, el UUID hace que /sync lo reporte como DUPLICADO.
      await cola.encolar(pedido, mesaSeleccionada.numero);
      cerrarPanel();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la comanda');
    } finally {
      setEnviando(false);
    }
  };

  if (cargandoSede) return <p className="pantalla-info">Cargando sede…</p>;
  if (errorSede || !sede) return <p className="pantalla-info">No se pudo cargar la sede.</p>;

  const pedidoSeleccionado = mesaSeleccionada?.estado === 'OCUPADA' ? pedidoDeMesa(mesaSeleccionada) : undefined;
  const pendienteSeleccionado =
    mesaSeleccionada && !pedidoSeleccionado ? pendienteDeMesa(mesaSeleccionada.id) : undefined;
  const nombreProducto = (id: string) => productos.find((p) => p.id === id)?.nombre ?? 'Producto';
  const nPendientes = cola.pendientes.length;
  const textoPendientes = `${nPendientes} pedido${nPendientes === 1 ? '' : 's'} pendiente${nPendientes === 1 ? '' : 's'}`;

  return (
    <div className="mesas-page">
      <div className="panel-pedido-header">
        <h1>Mesas — {sede.nombre}</h1>
        <button onClick={() => setMostrarQr((v) => !v)}>{mostrarQr ? 'Ocultar QR' : 'Códigos QR del menú'}</button>
      </div>

      {(!cola.enLinea || nPendientes > 0) && (
        <div className={`banner-offline${cola.enLinea ? ' banner-offline--sincronizando' : ''}`}>
          <span>
            {!cola.enLinea
              ? `Sin conexión — ${textoPendientes}`
              : cola.sincronizando
                ? `Sincronizando ${textoPendientes}…`
                : `${textoPendientes} de sincronizar`}
          </span>
          {cola.enLinea && !cola.sincronizando && nPendientes > 0 && (
            <button onClick={() => cola.sincronizar()}>Sincronizar ahora</button>
          )}
        </div>
      )}
      {cola.errorSync && <p className="login-error">No se pudo sincronizar: {cola.errorSync}</p>}
      {cola.rechazados.length > 0 && (
        <div className="banner-offline banner-offline--rechazo">
          <ul className="lista-items">
            {cola.rechazados.map((r) => (
              <li key={r.id}>
                Pedido {r.mesaNumero !== null ? `de la mesa ${r.mesaNumero}` : r.id.slice(0, 8)} rechazado al
                sincronizar: {r.motivo}
              </li>
            ))}
          </ul>
          <button onClick={cola.descartarRechazados}>Entendido</button>
        </div>
      )}

      {mostrarQr && (
        <div className="qr-grid">
          {mesas.map((mesa) => {
            const url = urlMenuMesa(sede.cadenaId, sede.id, mesa.numero);
            return (
              <div key={mesa.id} className="qr-card">
                <strong>Mesa {mesa.numero}</strong>
                <QRCodeSVG value={url} size={140} />
                <a href={url} target="_blank" rel="noreferrer">
                  Abrir menú
                </a>
              </div>
            );
          })}
        </div>
      )}

      <div className="mesas-grid">
        {mesasVista.map((mesa) => {
          const recienLista = mesasRecienListas.has(mesa.id);
          return (
            <button
              key={mesa.id}
              className={`mesa-card mesa-card--${mesa.estado.toLowerCase()}${recienLista ? ' mesa-card--recien-listo' : ''}`}
              onClick={() => abrirMesa(mesa)}
            >
              {recienLista && <span className="mesa-alerta">¡Listo!</span>}
              <span className="mesa-numero">Mesa {mesa.numero}</span>
              <span className="mesa-estado">
                {mesa.estado}
                {pendienteDeMesa(mesa.id) && ' · sin sincronizar'}
              </span>
            </button>
          );
        })}
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
              ) : pendienteSeleccionado ? (
                <ul className="lista-items">
                  {pendienteSeleccionado.pedido.detalles.map((detalle) => (
                    <li key={detalle.productoId}>
                      {detalle.cantidad}× {nombreProducto(detalle.productoId)}
                      {detalle.notas && <em> — {detalle.notas}</em>}
                    </li>
                  ))}
                  <li className="lista-items-estado">Estado: pendiente de sincronizar</li>
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
