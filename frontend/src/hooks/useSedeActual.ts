import { useEffect, useState } from 'react';
import { listarSedes, type Sede } from '../api/comanda';
import { useAuth } from '../auth/AuthContext';

// DECISIÓN DE PROTOTIPO: se asume una sola sede por cadena (coherente con el
// seed) y se toma la primera. El selector multi-sede queda fuera de alcance
// de este prototipo (ver docs/prototipo-slice.md).
export function useSedeActual() {
  const { token } = useAuth();
  const [sede, setSede] = useState<Sede | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listarSedes(token)
      .then((sedes) => setSede(sedes[0] ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la sede'))
      .finally(() => setCargando(false));
  }, [token]);

  return { sede, cargando, error };
}
