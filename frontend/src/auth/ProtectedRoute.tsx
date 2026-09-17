import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, type Rol } from './AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  roles?: Rol[];
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { usuario, cargando } = useAuth();

  if (cargando) {
    return null;
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(usuario.rol)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
