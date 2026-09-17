import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// DECISIÓN DE PROTOTIPO: landing simple con enlaces manuales en vez de un
// redirect automático por rol; con solo dos pantallas construidas (Mesas,
// Cocina) no vale la pena la lógica de ruteo por rol todavía. Caja llega en
// la Fase 5.
export function HomePage() {
  const { usuario, logout } = useAuth();
  const puedeVerMesas = usuario?.rol === 'MESERO' || usuario?.rol === 'ADMIN';

  return (
    <div className="home-page">
      <h1>Bienvenido</h1>
      <p>{usuario?.email}</p>
      <p className="home-rol">Rol: {usuario?.rol}</p>

      <nav className="home-nav">
        {puedeVerMesas && <Link to="/mesas">Ir a Mesas</Link>}
        <Link to="/cocina">Ir a Cocina</Link>
      </nav>

      <p className="home-nota">La pantalla de Caja llega en la Fase 5 del prototipo.</p>
      <button onClick={logout}>Cerrar sesión</button>
    </div>
  );
}
