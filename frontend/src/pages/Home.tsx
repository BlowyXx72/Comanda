import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// DECISIÓN DE PROTOTIPO: landing simple con enlaces manuales en vez de un
// redirect automático por rol; con solo tres pantallas (Mesas, Cocina, Caja)
// no vale la pena la lógica de ruteo por rol todavía.
export function HomePage() {
  const { usuario, logout } = useAuth();
  const puedeVerMesas = usuario?.rol === 'MESERO' || usuario?.rol === 'ADMIN';
  const puedeVerCaja = usuario?.rol === 'CAJERO' || usuario?.rol === 'ADMIN';

  return (
    <div className="home-page">
      <h1>Bienvenido</h1>
      <p>{usuario?.email}</p>
      <p className="home-rol">Rol: {usuario?.rol}</p>

      <nav className="home-nav">
        {puedeVerMesas && <Link to="/mesas">Ir a Mesas</Link>}
        <Link to="/cocina">Ir a Cocina</Link>
        {puedeVerCaja && <Link to="/caja">Ir a Caja</Link>}
      </nav>

      <button onClick={logout}>Cerrar sesión</button>
    </div>
  );
}
