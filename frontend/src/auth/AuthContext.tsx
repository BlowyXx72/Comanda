import { createContext, useContext, useState, type ReactNode } from 'react';
import { apiFetch } from '../api/client';

export type Rol = 'ADMIN' | 'CAJERO' | 'MESERO';

export interface Usuario {
  id: string;
  email: string;
  rol: Rol;
  cadenaId: string;
}

interface LoginResponse {
  accessToken: string;
  usuario: Usuario;
}

interface AuthContextValue {
  usuario: Usuario | null;
  token: string | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// DECISIÓN DE PROTOTIPO: sesión persistida en localStorage. En producción se
// evaluaría una cookie httpOnly para no exponer el JWT a JavaScript del cliente.
const STORAGE_KEY = 'comanda.sesion';

// La sesión guardada se lee una sola vez, al crear el estado (localStorage es
// síncrono, así que no hace falta un efecto ni un estado de "cargando").
function leerSesionGuardada(): LoginResponse | null {
  const guardado = localStorage.getItem(STORAGE_KEY);
  if (!guardado) return null;
  try {
    return JSON.parse(guardado) as LoginResponse;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesionInicial] = useState(leerSesionGuardada);
  const [token, setToken] = useState<string | null>(sesionInicial?.accessToken ?? null);
  const [usuario, setUsuario] = useState<Usuario | null>(sesionInicial?.usuario ?? null);
  // Se conserva en el contexto por compatibilidad con ProtectedRoute; con la
  // lectura síncrona de arriba ya nunca está cargando.
  const cargando = false;

  const login = async (email: string, password: string) => {
    const sesion = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sesion));
    setToken(sesion.accessToken);
    setUsuario(sesion.usuario);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUsuario(null);
  };

  return (
    <AuthContext.Provider value={{ usuario, token, cargando, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}
