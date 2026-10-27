import { createContext, useContext } from 'react';
import type { Sede } from '../api/comanda';

// Fase 15: el contexto y el hook viven aparte del componente SedeProvider
// (SedeProvider.tsx) para que Fast Refresh funcione (regla
// react/only-export-components de oxlint).

export interface SedeContextValue {
  sedes: Sede[];
  sede: Sede | null;
  cargando: boolean;
  error: string | null;
  seleccionarSede: (id: string) => void;
}

export const SedeContext = createContext<SedeContextValue | undefined>(undefined);

export function useSedeContext(): SedeContextValue {
  const ctx = useContext(SedeContext);
  if (!ctx) {
    throw new Error('useSedeContext debe usarse dentro de <SedeProvider>');
  }
  return ctx;
}
