import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icono } from '../ui/Icono';
import { destinosDeRol } from '../ui/navegacion';

const SALUDO_ROL = { ADMIN: 'Administración', CAJERO: 'Caja', MESERO: 'Salón' } as const;

// Inicio del personal: accesos a las pantallas de su rol, en tarjetas grandes
// pensadas para tablet. La lista sale de ui/navegacion.ts, la misma de la
// barra superior.
export function HomePage() {
  const { usuario } = useAuth();
  const destinos = destinosDeRol(usuario?.rol);

  return (
    <div className="home-page">
      <header className="home-encabezado">
        <p className="home-eyebrow">{usuario ? SALUDO_ROL[usuario.rol] : ''}</p>
        <h1>Hola, ¿qué vamos a atender hoy?</h1>
        <p className="panel-nota">{usuario?.email}</p>
      </header>

      <nav className="home-nav" aria-label="Accesos">
        {destinos.map((destino) => (
          <Link key={destino.ruta} to={destino.ruta} className={`home-tarjeta home-tarjeta--${destino.icono}`}>
            <span className="home-tarjeta-icono">
              <Icono nombre={destino.icono} tamano={24} />
            </span>
            <span className="home-tarjeta-titulo">{destino.titulo}</span>
            <span className="home-tarjeta-texto">{destino.descripcion}</span>
          </Link>
        ))}
        {usuario?.rol === 'ADMIN' && (
          <Link to="/simulador-plataforma" className="home-tarjeta home-tarjeta--plataforma">
            <span className="home-tarjeta-icono">
              <Icono nombre="plataforma" tamano={24} />
            </span>
            <span className="home-tarjeta-titulo">Simulador de plataforma</span>
            <span className="home-tarjeta-texto">Envía pedidos de prueba como si fueras Rappi (Fase 12B).</span>
          </Link>
        )}
      </nav>
    </div>
  );
}
