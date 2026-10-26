import { useEffect, useState, type ReactNode } from 'react';
import { listarSedes, type Sede } from '../api/comanda';
import { useAuth } from '../auth/AuthContext';
import { SedeContext } from './SedeContext';

// DECISIÓN DE PROTOTIPO (Fase 7): Usuario no tiene una sede asignada en el
// schema (ver CLAUDE.md), así que la sede activa se guarda en localStorage
// por navegador, no por usuario. Solo ADMIN ve el selector
// (SelectorSedeGlobal); MESERO/CAJERO operan siempre en la última sede
// elegida (por defecto, la primera de la cadena).
const STORAGE_KEY = 'comanda.sedeId';

// Resultado de cargar las sedes con un token. Guardar el token permite
// derivar `cargando` (aún no hay resultado para el token actual) en vez de
// ponerlo en true desde el efecto.
interface CargaSedes {
  token: string;
  sedes: Sede[];
  error: string | null;
}

export function SedeProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [carga, setCarga] = useState<CargaSedes | null>(null);
  const [sedeId, setSedeId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  useEffect(() => {
    if (!token) return;
    let vigente = true;
    listarSedes(token)
      .then((sedes) => {
        if (vigente) setCarga({ token, sedes, error: null });
      })
      .catch((err) => {
        const error = err instanceof Error ? err.message : 'No se pudieron cargar las sedes';
        if (vigente) setCarga({ token, sedes: [], error });
      });
    return () => {
      vigente = false;
    };
  }, [token]);

  const actual = token && carga?.token === token ? carga : null;
  const sedes = actual?.sedes ?? [];
  const cargando = !!token && !actual;

  const seleccionarSede = (id: string) => {
    setSedeId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  // Si la sede guardada ya no es de esta cadena (o no hay), se usa la primera.
  const sede = sedes.find((s) => s.id === sedeId) ?? sedes[0] ?? null;

  return (
    <SedeContext.Provider value={{ sedes, sede, cargando, error: actual?.error ?? null, seleccionarSede }}>
      {children}
    </SedeContext.Provider>
  );
}
