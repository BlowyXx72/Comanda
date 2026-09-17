import { useAuth } from '../auth/AuthContext';

// DECISIÓN DE PROTOTIPO: pantalla de aterrizaje temporal solo para probar el
// login. Se reemplaza en la Fase 4/5 por el ruteo real a /mesas, /cocina o
// /caja según el rol del usuario.
export function HomePage() {
  const { usuario, logout } = useAuth();

  return (
    <div className="home-page">
      <h1>Bienvenido</h1>
      <p>{usuario?.email}</p>
      <p className="home-rol">Rol: {usuario?.rol}</p>
      <p className="home-nota">
        Las pantallas de Mesas, Cocina y Caja llegan en las Fases 4 y 5 del prototipo.
      </p>
      <button onClick={logout}>Cerrar sesión</button>
    </div>
  );
}
