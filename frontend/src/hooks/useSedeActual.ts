import { useSedeContext } from '../sede/SedeContext';

// DECISIÓN DE PROTOTIPO (Fase 7): la sede activa vive en SedeContext
// (localStorage + selector para ADMIN). Este hook se mantiene como fachada
// de solo lectura con la misma firma de antes, para no tener que tocar las
// páginas que ya lo consumían.
export function useSedeActual() {
  const { sede, cargando, error } = useSedeContext();
  return { sede, cargando, error };
}
