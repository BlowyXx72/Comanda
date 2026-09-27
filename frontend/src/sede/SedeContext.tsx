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
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [sedeId, setSedeId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setSedes([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    listarSedes(token)
      .then((resultado) => {
        setSedes(resultado);
        setSedeId((actual) => (actual && resultado.some((s) => s.id === actual) ? actual : (resultado[0]?.id ?? null)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar las sedes'))
      .finally(() => setCargando(false));
  }, [token]);

  const seleccionarSede = (id: string) => {
    setSedeId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const sede = sedes.find((s) => s.id === sedeId) ?? null;

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
