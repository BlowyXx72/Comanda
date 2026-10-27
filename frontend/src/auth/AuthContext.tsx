import { createContext, useContext } from 'react';

// Fase 15: el contexto y el hook viven aparte del componente AuthProvider
// (AuthProvider.tsx) para que Fast Refresh funcione (regla
// react/only-export-components de oxlint).

export type Rol = 'ADMIN' | 'CAJERO' | 'MESERO';

export interface Usuario {
  id: string;
  email: string;
  rol: Rol;
  cadenaId: string;
  // Fase 17: sede asignada (null = todas, el ADMIN). Falta en sesiones
  // guardadas antes de la Fase 17.
  sedeId?: string | null;
}

export interface LoginResponse {
  accessToken: string;
  usuario: Usuario;
}

export interface AuthContextValue {
  usuario: Usuario | null;
  token: string | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}
