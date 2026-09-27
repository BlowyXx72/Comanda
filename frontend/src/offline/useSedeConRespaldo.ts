import { useEffect, useState } from 'react';
import type { Sede } from '../api/comanda';
import { useAuth } from '../auth/AuthContext';
import { useSedeActual } from '../hooks/useSedeActual';
import { guardarEnCache } from './cache';
import { leerCache } from './db';

// Envuelve useSedeActual (que es de la Parte 1 y no se toca) para que /mesas
// abra sin conexión: si GET /sedes falla, usa la última sede guardada.
// Devuelve la misma forma { sede, cargando, error }.
export function useSedeConRespaldo() {
  const { usuario } = useAuth();
  const { sede, cargando, error } = useSedeActual();
  // undefined = todavía no se buscó en la caché.
  const [respaldo, setRespaldo] = useState<Sede | null | undefined>(undefined);
  const clave = `sede:${usuario?.cadenaId ?? ''}`;

  useEffect(() => {
    if (sede) guardarEnCache(clave, sede);
  }, [sede, clave]);

  useEffect(() => {
    if (!error || sede) return;
    leerCache<Sede>(clave)
      .then((s) => setRespaldo(s ?? null))
      .catch(() => setRespaldo(null));
  }, [error, sede, clave]);

  if (sede) return { sede, cargando, error };
  if (respaldo) return { sede: respaldo, cargando: false, error: null };
  return { sede: null, cargando: cargando || (!!error && respaldo === undefined), error };
}
