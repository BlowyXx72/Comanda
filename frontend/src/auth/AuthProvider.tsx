import { useState, type ReactNode } from 'react';
import { apiFetch } from '../api/client';
import { AuthContext, type LoginResponse } from './AuthContext';

// DECISIÓN DE PROTOTIPO: sesión persistida en localStorage. En producción se
// evaluaría una cookie httpOnly para no exponer el JWT a JavaScript del cliente.
const STORAGE_KEY = 'comanda.sesion';

// localStorage es síncrono: la sesión guardada se lee al crear el estado, sin
// un efecto que la cargue después (y sin un render intermedio "sin sesión").
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
  const [sesion, setSesion] = useState<LoginResponse | null>(leerSesionGuardada);

  const login = async (email: string, password: string) => {
    const nueva = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nueva));
    setSesion(nueva);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSesion(null);
  };

  // `cargando` se mantiene en el contrato del contexto (lo usa
  // ProtectedRoute), pero ya nunca es true: la sesión se lee de inmediato.
  return (
    <AuthContext.Provider
      value={{ usuario: sesion?.usuario ?? null, token: sesion?.accessToken ?? null, cargando: false, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
