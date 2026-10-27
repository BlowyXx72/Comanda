import { useLayoutEffect, useRef } from 'react';

// Ref que siempre apunta a la última versión de un valor (p. ej. el callback
// de un evento de socket), sin que cambiarlo obligue a reabrir la conexión.
// Se actualiza en un efecto y no durante el render, como pide React.
export function useUltimoValor<T>(valor: T) {
  const ref = useRef(valor);
  useLayoutEffect(() => {
    ref.current = valor;
  });
  return ref;
}
