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
import { BotonTema } from '../ui/BotonTema';
import { Icono } from '../ui/Icono';
import { formatearCOP } from '../utils/formato';

// Ancla de cada categoría para las fichas de atajo del encabezado.
const anclaCategoria = (categoria: string) => `cat-${categoria.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

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
  const [cliente, setCliente] = useState({ nombre: '', telefono: '', direccion: '', email: '' });
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
        // Fase 14B: el correo es opcional; vacío no se manda.
        cliente: { ...cliente, email: cliente.email.trim() || undefined },
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

  if (error) return <p className="pantalla-info pantalla-info--menu">{error}</p>;
  if (!menu) return <p className="pantalla-info pantalla-info--menu">Cargando menú…</p>;

  const cantidadCarrito = itemsCarrito.reduce((acc, item) => acc + item.cantidad, 0);

  return (
    <div className="menu-publico">
      <header className="menu-publico-header">
        <BotonTema />
        <p className="menu-publico-eyebrow">
          <Icono nombre="cubiertos" tamano={16} />
          Nuestro menú
        </p>
        <h1>{menu.sede.nombre}</h1>
        <p>
          <Icono nombre="ubicacion" tamano={16} />
          {menu.sede.direccion}
        </p>
        {mesa && (
          <div>
            <span className="comanda-badge">Mesa {mesa}</span>
          </div>
        )}
      </header>

      {menu.categorias.length > 1 && (
        <nav className="menu-publico-chips" aria-label="Categorías">
          {menu.categorias.map((grupo) => (
            <a key={grupo.categoria} href={`#${anclaCategoria(grupo.categoria)}`}>
              {grupo.categoria}
            </a>
          ))}
        </nav>
      )}

      {menu.categorias.length === 0 && <p className="pantalla-info">El menú está vacío por ahora.</p>}

      {menu.categorias.map((grupo) => (
        <section key={grupo.categoria} id={anclaCategoria(grupo.categoria)} className="menu-publico-categoria">
          <h2>{grupo.categoria}</h2>
          <ul className="lista-items">
            {grupo.productos.map((producto) => {
              const enCarrito = carrito[producto.id];
              return (
                <li key={producto.id} className={`menu-publico-item${enCarrito ? ' menu-publico-item--en-carrito' : ''}`}>
                  {/* Fase 16B: foto del producto. Diferida (lazy) y con tamaño fijo 4:3
                      para que la página no salte al cargar; la de 400 px basta en un
                      celular y la de 800 px se usa en pantallas densas. */}
                  {producto.imagenMiniaturaUrl && (
                    <img
                      className="menu-publico-item-foto"
                      src={producto.imagenMiniaturaUrl}
                      srcSet={`${producto.imagenMiniaturaUrl} 400w, ${producto.imagenUrl} 800w`}
                      sizes="(min-width: 640px) 120px, 88px"
                      width={400}
                      height={300}
                      loading="lazy"
                      decoding="async"
                      alt={producto.nombre}
                    />
                  )}
                  <span className="menu-publico-item-texto">
                    <span className="menu-publico-item-nombre">{producto.nombre}</span>
                    <span className="menu-publico-item-precio">{formatearCOP(producto.precio)}</span>
                  </span>
                  <span className="carrito-item-acciones">
                    {enCarrito && (
                      <>
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(producto, -1)}
                          aria-label={`Quitar un ${producto.nombre}`}
                        >
                          <Icono nombre="menos" tamano={18} />
                        </button>
                        <span aria-live="polite">{enCarrito.cantidad}</span>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(producto, 1)}
                      aria-label={`Agregar un ${producto.nombre}`}
                    >
                      <Icono nombre="mas" tamano={18} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {cantidadCarrito > 0 && !pedidoCreado && (
        <button
          type="button"
          className="menu-publico-barra"
          onClick={() => document.getElementById('domicilio')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <span>Ver pedido ({cantidadCarrito})</span>
          <span className="menu-publico-barra-total">
            <Icono nombre="bolsa" tamano={18} />
            {formatearCOP(totalCarrito)}
          </span>
        </button>
      )}

      <section id="domicilio" className="menu-publico-domicilio">
        <h2>Pedir a domicilio</h2>

        {pedidoCreado ? (
          <div className="panel-pedido recibo">
            <p className="estado-dian estado-dian--validado_simulado">
              <Icono nombre="check" tamano={18} />
              ¡Pedido recibido! Ya está en preparación.
            </p>
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
            <label>
              Correo (opcional, para enviarte el comprobante)
              <input
                type="email"
                maxLength={254}
                value={cliente.email}
                onChange={(e) => setCliente({ ...cliente, email: e.target.value })}
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
