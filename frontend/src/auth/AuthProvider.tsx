import { useEffect, useState, type ReactNode } from 'react';
import { ApiError, apiFetch } from '../api/client';
import { AuthContext, type LoginResponse, type Rol } from './AuthContext';

// Respuesta de GET /auth/me (UsuarioAutenticado del backend).
interface UsuarioDeMe {
  userId: string;
  email: string;
  rol: Rol;
  cadenaId: string;
  sedeId: string | null;
}

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

  // El ADMIN puede cambiar la sede o el rol de un usuario, o desactivarlo,
  // desde /usuarios; el backend ya lo aplica (lee la base en cada petición),
  // pero el usuario guardado aquí venía del login. Al abrir la app se refresca
  // con GET /auth/me; si la sesión ya no vale (401), se cierra.
  const tokenGuardado = sesion?.accessToken;
  useEffect(() => {
    if (!tokenGuardado) return;
    let vigente = true;
    apiFetch<UsuarioDeMe>('/auth/me', {}, tokenGuardado)
      .then((me) => {
        if (!vigente) return;
        setSesion((prev) => {
          if (!prev || prev.accessToken !== tokenGuardado) return prev;
          const actualizada: LoginResponse = {
            ...prev,
            usuario: { id: me.userId, email: me.email, rol: me.rol, cadenaId: me.cadenaId, sedeId: me.sedeId },
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(actualizada));
          return actualizada;
        });
      })
      .catch((err) => {
        // Sin red (modo offline, CU-07) se conserva la sesión guardada.
        if (vigente && err instanceof ApiError && err.statusCode === 401) {
          localStorage.removeItem(STORAGE_KEY);
          setSesion(null);
        }
      });
    return () => {
      vigente = false;
    };
  }, [tokenGuardado]);

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
