import { useSyncExternalStore } from 'react';

// Modo claro / oscuro. Por defecto sigue al sistema operativo; si la persona
// lo cambia con el botón, su elección queda guardada en este navegador.
// El script de index.html aplica el tema antes de pintar; este módulo lo
// mantiene sincronizado después (botón y cambios del sistema).

export type Tema = 'claro' | 'oscuro';

const LLAVE = 'comanda:tema';
const COLOR_BARRA: Record<Tema, string> = { claro: '#FBF7EA', oscuro: '#1B1E24' };
const consultaOscuro = window.matchMedia('(prefers-color-scheme: dark)');
const oyentes = new Set<() => void>();

const leerGuardado = (): Tema | null => {
  try {
    const valor = localStorage.getItem(LLAVE);
    return valor === 'claro' || valor === 'oscuro' ? valor : null;
  } catch {
    return null;
  }
};

let elegido = leerGuardado();
const temaActual = (): Tema => elegido ?? (consultaOscuro.matches ? 'oscuro' : 'claro');

const aplicar = () => {
  const tema = temaActual();
  document.documentElement.dataset.theme = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[tema]);
  oyentes.forEach((oyente) => oyente());
};

consultaOscuro.addEventListener('change', () => {
  if (!elegido) aplicar();
});
aplicar();

export function alternarTema() {
  elegido = temaActual() === 'oscuro' ? 'claro' : 'oscuro';
  try {
    localStorage.setItem(LLAVE, elegido);
  } catch {
    // Sin almacenamiento solo se pierde recordar la elección.
  }
  aplicar();
}

export function useTema(): Tema {
  return useSyncExternalStore(
    (oyente) => {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    temaActual,
  );
}
