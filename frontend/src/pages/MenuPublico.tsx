import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { obtenerMenuPublico, type MenuPublico } from '../api/comanda';
import { ApiError } from '../api/client';
import { formatearCOP } from '../utils/formato';

// Vista del comensal (CU-03): se abre desde el QR de la mesa, sin iniciar
// sesión, en el navegador del teléfono. Por eso está fuera de ProtectedRoute
// y el layout es de una sola columna.
export function MenuPublicoPage() {
  const { cadenaId, sedeId } = useParams();
  const [searchParams] = useSearchParams();
  const mesa = searchParams.get('mesa');

  const [menu, setMenu] = useState<MenuPublico | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cadenaId || !sedeId) return;
    obtenerMenuPublico(cadenaId, sedeId)
      .then(setMenu)
      .catch((err) =>
        setError(err instanceof ApiError && err.statusCode === 404 ? 'Este menú no existe.' : 'No se pudo cargar el menú.'),
      );
  }, [cadenaId, sedeId]);

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
                <span>{producto.nombre}</span>
                <span>{formatearCOP(producto.precio)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
