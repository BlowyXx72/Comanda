import { ApiError } from '../api/client';
import { escribirCache, leerCache } from './db';

// Un fallo de red (fetch rechazado) llega como TypeError; un error HTTP del
// backend llega como ApiError y no es motivo para trabajar sin conexión.
export const esErrorDeRed = (err: unknown) => !(err instanceof ApiError);

// Pide a la red y guarda la respuesta en IndexedDB; si la red falla, devuelve
// la última copia guardada (catálogo, mesas y pedidos activos de /mesas).
export async function conRespaldo<T>(clave: string, pedir: () => Promise<T>): Promise<T> {
  try {
    const valor = await pedir();
    guardarEnCache(clave, valor);
    return valor;
  } catch (err) {
    if (!esErrorDeRed(err)) throw err;
    const copia = await leerCache<T>(clave).catch(() => undefined);
    if (copia === undefined) throw err;
    return copia;
  }
}

// La caché es un respaldo: si IndexedDB no está disponible (p. ej. navegación
// privada) la app sigue funcionando en línea.
export function guardarEnCache(clave: string, valor: unknown) {
  escribirCache(clave, valor).catch(() => undefined);
}
