import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSedeContext } from '../sede/SedeContext';
import { AvisoCambioSede } from '../ui/AvisoCambioSede';
import { BarraSuperior } from '../ui/BarraSuperior';
import { useAuth, type Rol } from './AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  roles?: Rol[];
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { usuario, cargando } = useAuth();
  const { sede } = useSedeContext();

  if (cargando) {
    return null;
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(usuario.rol)) {
    return <Navigate to="/" replace />;
  }

  // Toda pantalla del personal lleva la barra superior; el contenido va en
  // <main> para que lectores de pantalla y la animación de entrada lo ubiquen.
  // key = sede: al cambiar de sede la pantalla se monta de nuevo, así entra
  // con su animación y arranca limpia (sin el pedido o cobro abierto de la
  // sede anterior).
  return (
    <>
      <BarraSuperior />
      <AvisoCambioSede />
      <main key={sede?.id ?? 'sin-sede'} className="contenido">
        {children}
      </main>
    </>
  );
}
