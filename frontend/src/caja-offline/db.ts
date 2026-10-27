import type { PagoOfflineInput, Pedido, RangoOffline } from '../api/comanda';

// Fase 16 (CU-07, §6.3): almacenamiento local de la caja para cobrar sin
// conexión. Una base IndexedDB propia, aparte de la del mesero
// (src/offline/db.ts, Parte 2), para no tener que subir su versión.
// DECISIÓN DE PROTOTIPO: IndexedDB directo, igual que en 9B (sin Dexie/idb).
const DB_NAME = 'comanda-caja-offline';
const DB_VERSION = 1;
const STORE_RANGOS = 'rangos';
const STORE_COBROS = 'cobros';

// Bloque reservado al backend, con el próximo número que esta caja puede usar.
export interface RangoLocal extends RangoOffline {
  siguiente: number;
}

export interface CobroPendiente {
  // Mismo UUID del pago.
  id: string;
  pago: PagoOfflineInput;
  // Para mostrarlo en la caja mientras no se sincroniza.
  pedido: Pedido;
}

let conexion: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  conexion ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RANGOS)) db.createObjectStore(STORE_RANGOS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_COBROS)) db.createObjectStore(STORE_COBROS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      conexion = null;
      reject(req.error);
    };
  });
  return conexion;
}

function esperar<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function terminar(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function guardarRango(rango: RangoOffline): Promise<void> {
  const tx = (await abrir()).transaction(STORE_RANGOS, 'readwrite');
  tx.objectStore(STORE_RANGOS).put({ ...rango, siguiente: rango.inicio } satisfies RangoLocal);
  await terminar(tx);
}

// Cuántos números le quedan a esta caja en la sede.
export async function numerosDisponibles(sedeId: string): Promise<number> {
  const db = await abrir();
  const rangos = await esperar<RangoLocal[]>(db.transaction(STORE_RANGOS).objectStore(STORE_RANGOS).getAll());
  return rangos.filter((r) => r.sedeId === sedeId).reduce((acc, r) => acc + Math.max(0, r.fin - r.siguiente + 1), 0);
}

// Toma el próximo consecutivo de la sede y deja encolado el cobro, en una sola
// transacción de IndexedDB: si algo falla, el número no se pierde.
// Devuelve null si la caja no tiene números reservados para esa sede.
export async function cobrarConConsecutivo(
  sedeId: string,
  armarCobro: (consecutivo: number) => CobroPendiente,
): Promise<CobroPendiente | null> {
  const tx = (await abrir()).transaction([STORE_RANGOS, STORE_COBROS], 'readwrite');
  const rangos = tx.objectStore(STORE_RANGOS);
  const todos = await esperar<RangoLocal[]>(rangos.getAll());
  const rango = todos.filter((r) => r.sedeId === sedeId && r.siguiente <= r.fin).sort((a, b) => a.inicio - b.inicio)[0];
  if (!rango) {
    tx.abort();
    await terminar(tx).catch(() => undefined);
    return null;
  }
  const cobro = armarCobro(rango.siguiente);
  rangos.put({ ...rango, siguiente: rango.siguiente + 1 });
  tx.objectStore(STORE_COBROS).put(cobro);
  await terminar(tx);
  return cobro;
}

export async function listarCobros(): Promise<CobroPendiente[]> {
  const db = await abrir();
  const todos = await esperar<CobroPendiente[]>(db.transaction(STORE_COBROS).objectStore(STORE_COBROS).getAll());
  // Se sincronizan en el orden en que se cobraron.
  return todos.sort((a, b) => a.pago.fechaHora.localeCompare(b.pago.fechaHora));
}

export async function quitarCobros(ids: string[]): Promise<void> {
  const tx = (await abrir()).transaction(STORE_COBROS, 'readwrite');
  ids.forEach((id) => tx.objectStore(STORE_COBROS).delete(id));
  await terminar(tx);
}
