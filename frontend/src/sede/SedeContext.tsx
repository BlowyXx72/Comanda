import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { listarSedes, type Sede } from '../api/comanda';
import { useAuth } from '../auth/AuthContext';

// DECISIÓN DE PROTOTIPO (Fase 7): Usuario no tiene una sede asignada en el
// schema (ver CLAUDE.md), así que la sede activa se guarda en localStorage
// por navegador, no por usuario. Solo ADMIN ve el selector
// (SelectorSedeGlobal); MESERO/CAJERO operan siempre en la última sede
// elegida (por defecto, la primera de la cadena).
const STORAGE_KEY = 'comanda.sedeId';

interface SedeContextValue {
  sedes: Sede[];
  sede: Sede | null;
  cargando: boolean;
  error: string | null;
  seleccionarSede: (id: string) => void;
}

const SedeContext = createContext<SedeContextValue | undefined>(undefined);

export function SedeProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [sedeId, setSedeId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  // Resultado de la última carga, atado al token con el que se pidió: si el
  // token cambia, el resultado viejo deja de valer sin tener que limpiarlo.
  const [carga, setCarga] = useState<{ token: string; sedes: Sede[]; error: string | null } | null>(null);

  useEffect(() => {
    if (!token) return;
    let vigente = true;
    listarSedes(token)
      .then((resultado) => vigente && setCarga({ token, sedes: resultado, error: null }))
      .catch(
        (err) =>
          vigente &&
          setCarga({ token, sedes: [], error: err instanceof Error ? err.message : 'No se pudieron cargar las sedes' }),
      );
    return () => {
      vigente = false;
    };
  }, [token]);

  const actual = token && carga?.token === token ? carga : null;
  const sedes = actual?.sedes ?? [];
  const cargando = !!token && !actual;
  const error = actual?.error ?? null;

  const seleccionarSede = (id: string) => {
    setSedeId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  // Si la sede guardada ya no es de la cadena (o no hay), se usa la primera.
  const sede = sedes.find((s) => s.id === sedeId) ?? sedes[0] ?? null;

  return (
    <SedeContext.Provider value={{ sedes, sede, cargando, error, seleccionarSede }}>
      {children}
    </SedeContext.Provider>
  );
}

export function useSedeContext(): SedeContextValue {
  const ctx = useContext(SedeContext);
  if (!ctx) {
    throw new Error('useSedeContext debe usarse dentro de <SedeProvider>');
  }
  return ctx;
}
