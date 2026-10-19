import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { SelectorSedeGlobal } from '../sede/SelectorSedeGlobal';
import { BotonTema } from './BotonTema';
import { Icono } from './Icono';
import { destinosDeRol } from './navegacion';

// Barra del personal: marca, navegación según el rol, selector de sede
// (ADMIN), modo claro/oscuro y salir. La monta ProtectedRoute, así que toda
// pantalla protegida la tiene sin tocar su código. En pantallas angostas la
// navegación pasa a una barra inferior (ver .barra-nav en App.css).
export function BarraSuperior() {
  const { usuario, logout } = useAuth();
  const destinos = destinosDeRol(usuario?.rol);

  return (
    <header className="barra">
      <Link to="/" className="barra-marca" aria-label="Comanda, ir al inicio">
        <span className="barra-logo">
          <Icono nombre="cubiertos" tamano={18} />
        </span>
        <span className="barra-marca-texto">Comanda</span>
      </Link>

      <nav className="barra-nav" aria-label="Pantallas">
        {destinos.map((destino) => (
          <NavLink key={destino.ruta} to={destino.ruta} className="barra-enlace">
            <Icono nombre={destino.icono} />
            <span>{destino.titulo}</span>
          </NavLink>
        ))}
      </nav>

      <div className="barra-acciones">
        <SelectorSedeGlobal />
        <BotonTema />
        <span className="barra-usuario" title={usuario?.email}>
          {usuario?.rol}
        </span>
        <button type="button" className="boton-icono" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">
          <Icono nombre="salir" />
        </button>
      </div>
    </header>
  );
}
