import type { CrearPedidoInput } from '../api/comanda';

// Consumido por: cache.ts (catálogo/mesas/sede) y useColaOffline.ts (cola de
// pedidos) para el modo sin conexión del mesero (CU-07, §6.3).
// DECISIÓN DE PROTOTIPO: IndexedDB se usa directo con la API del navegador
// (sin Dexie/idb) porque solo hacen falta dos almacenes y operaciones simples.
const DB_NAME = 'comanda-offline';
const DB_VERSION = 1;
const STORE_CACHE = 'cache';
const STORE_COLA = 'cola';

export interface PedidoPendiente {
  // Mismo UUID del pedido: si se encola dos veces, se sobreescribe.
  id: string;
  pedido: CrearPedidoInput;
  mesaNumero: number | null;
  creadoEn: string;
}

let conexion: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  conexion ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) db.createObjectStore(STORE_CACHE);
      if (!db.objectStoreNames.contains(STORE_COLA)) db.createObjectStore(STORE_COLA, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      conexion = null;
      reject(req.error);
    };
  });
  return conexion;
}

async function transaccion<T>(
  store: string,
  modo: IDBTransactionMode,
  operar: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, modo);
    const req = operar(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const leerCache = <T>(clave: string) =>
  transaccion<T>(STORE_CACHE, 'readonly', (s) => s.get(clave) as IDBRequest<T>);

export const escribirCache = (clave: string, valor: unknown) =>
  transaccion(STORE_CACHE, 'readwrite', (s) => {
    s.put(valor, clave);
  });

export async function listarCola(): Promise<PedidoPendiente[]> {
  const todos = (await transaccion<PedidoPendiente[]>(STORE_COLA, 'readonly', (s) => s.getAll())) ?? [];
  // Se sincronizan en el orden en que el mesero los armó.
  return todos.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

export const agregarACola = (pendiente: PedidoPendiente) =>
  transaccion(STORE_COLA, 'readwrite', (s) => {
    s.put(pendiente);
  });

export const quitarDeCola = (ids: string[]) =>
  transaccion(STORE_COLA, 'readwrite', (s) => {
    ids.forEach((id) => s.delete(id));
  });
