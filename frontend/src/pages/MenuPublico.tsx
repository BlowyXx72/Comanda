import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  crearPedidoDomicilio,
  obtenerMenuPublico,
  type MenuPublico,
  type PedidoDomicilioCreado,
  type ProductoMenu,
} from '../api/comanda';
import { ApiError } from '../api/client';
import { formatearCOP } from '../utils/formato';

interface ItemCarrito {
  producto: ProductoMenu;
  cantidad: number;
}

// Vista del comensal (CU-03): se abre desde el QR de la mesa, sin iniciar
// sesión, en el navegador del teléfono. Por eso está fuera de ProtectedRoute
// y el layout es de una sola columna. Desde aquí mismo un cliente remoto
// puede pedir a domicilio (CU-04).
export function MenuPublicoPage() {
  const { cadenaId, sedeId } = useParams();
  const [searchParams] = useSearchParams();
  const mesa = searchParams.get('mesa');

  const [menu, setMenu] = useState<MenuPublico | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [carrito, setCarrito] = useState<Record<string, ItemCarrito>>({});
  const [cliente, setCliente] = useState({ nombre: '', telefono: '', direccion: '' });
  const [enviando, setEnviando] = useState(false);
  const [errorPedido, setErrorPedido] = useState<string | null>(null);
  const [pedidoCreado, setPedidoCreado] = useState<PedidoDomicilioCreado | null>(null);

  useEffect(() => {
    if (!cadenaId || !sedeId) return;
    obtenerMenuPublico(cadenaId, sedeId)
      .then(setMenu)
      .catch((err) =>
        setError(err instanceof ApiError && err.statusCode === 404 ? 'Este menú no existe.' : 'No se pudo cargar el menú.'),
      );
  }, [cadenaId, sedeId]);

  const cambiarCantidad = (producto: ProductoMenu, delta: number) => {
    setCarrito((prev) => {
      const cantidad = (prev[producto.id]?.cantidad ?? 0) + delta;
      if (cantidad <= 0) {
        const { [producto.id]: _omitido, ...resto } = prev;
        return resto;
      }
      return { ...prev, [producto.id]: { producto, cantidad } };
    });
  };

  const itemsCarrito = Object.values(carrito);
  const totalCarrito = useMemo(
    () => itemsCarrito.reduce((acc, item) => acc + Number(item.producto.precio) * item.cantidad, 0),
    [itemsCarrito],
  );

  const enviarPedido = async (e: FormEvent) => {
    e.preventDefault();
    if (!cadenaId || !sedeId || itemsCarrito.length === 0) return;
    setEnviando(true);
    setErrorPedido(null);
    try {
      const creado = await crearPedidoDomicilio({
        id: crypto.randomUUID(),
        cadenaId,
        sedeId,
        cliente,
        detalles: itemsCarrito.map((item) => ({ productoId: item.producto.id, cantidad: item.cantidad })),
      });
      setPedidoCreado(creado);
      setCarrito({});
    } catch (err) {
      setErrorPedido(err instanceof ApiError ? err.message : 'No se pudo enviar el pedido');
    } finally {
      setEnviando(false);
    }
  };

  if (error) return <p className="pantalla-info">{error}</p>;
  if (!menu) return <p className="pantalla-info">Cargando menú…</p>;

  return (
    <div className="menu-publico">
      <header className="menu-publico-header">
        <h1>{menu.sede.nombre}</h1>
        <p>{menu.sede.direccion}</p>
        {mesa && <span className="comanda-badge">Mesa {mesa}</span>}
      </header>

      {menu.categorias.length === 0 && <p className="pantalla-info">El menú está vacío por ahora.</p>}

      {menu.categorias.map((grupo) => (
        <section key={grupo.categoria} className="menu-publico-categoria">
          <h2>{grupo.categoria}</h2>
          <ul className="lista-items">
            {grupo.productos.map((producto) => (
              <li key={producto.id} className="menu-publico-item">
                <span>
                  {producto.nombre}
                  <br />
                  <small>{formatearCOP(producto.precio)}</small>
                </span>
                <span className="carrito-item-acciones">
                  {carrito[producto.id] && (
                    <>
                      <button type="button" onClick={() => cambiarCantidad(producto, -1)}>
                        −
                      </button>
                      <span>{carrito[producto.id].cantidad}</span>
                    </>
                  )}
                  <button type="button" onClick={() => cambiarCantidad(producto, 1)}>
                    +
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="menu-publico-domicilio">
        <h2>Pedir a domicilio</h2>

        {pedidoCreado ? (
          <div className="panel-pedido recibo">
            <p>¡Pedido recibido! Ya está en preparación.</p>
            <p className="carrito-total">Total: {formatearCOP(pedidoCreado.total)}</p>
            <button type="button" onClick={() => setPedidoCreado(null)}>
              Hacer otro pedido
            </button>
          </div>
        ) : itemsCarrito.length === 0 ? (
          <p className="panel-nota">Agrega productos con “+” para armar tu pedido.</p>
        ) : (
          <form className="login-form" onSubmit={enviarPedido}>
            <ul className="lista-items">
              {itemsCarrito.map((item) => (
                <li key={item.producto.id}>
                  {item.cantidad}× {item.producto.nombre}
                </li>
              ))}
            </ul>
            <p className="carrito-total">Total: {formatearCOP(totalCarrito)}</p>

            <label>
              Nombre
              <input
                required
                maxLength={120}
                value={cliente.nombre}
                onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })}
              />
            </label>
            <label>
              Teléfono
              <input
                required
                type="tel"
                maxLength={30}
                value={cliente.telefono}
                onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })}
              />
            </label>
            <label>
              Dirección de entrega
              <input
                required
                maxLength={200}
                value={cliente.direccion}
                onChange={(e) => setCliente({ ...cliente, direccion: e.target.value })}
              />
            </label>

            {errorPedido && <p className="login-error">{errorPedido}</p>}
            <button type="submit" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar pedido'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
