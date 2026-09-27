import { useCallback, useEffect, useRef, useState } from 'react';
import { sincronizarPedidos, type CrearPedidoInput } from '../api/comanda';
import { esErrorDeRed } from './cache';
import { agregarACola, listarCola, quitarDeCola, type PedidoPendiente } from './db';

// Mismo tope que SyncPedidosDto en el backend (@ArrayMaxSize(50)).
const TAMANO_LOTE = 50;
// DECISIÓN DE PROTOTIPO: además del evento `online`, se reintenta cada 15 s
// mientras haya pendientes, porque `navigator.onLine` puede decir "en línea"
// aunque el backend no sea alcanzable.
const REINTENTO_MS = 15_000;

export interface PedidoRechazado {
  id: string;
  mesaNumero: number | null;
  motivo: string;
}

// Cola local de pedidos del mesero (CU-07): guarda en IndexedDB lo que no se
// pudo enviar y lo vacía contra POST /sync al recuperar la conexión.
// `alSincronizar` se llama cuando el backend aplicó al menos un pedido.
export function useColaOffline(token: string | null, alSincronizar?: () => void) {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  const [pendientes, setPendientes] = useState<PedidoPendiente[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [rechazados, setRechazados] = useState<PedidoRechazado[]>([]);
  const [errorSync, setErrorSync] = useState<string | null>(null);
  const enCurso = useRef(false);
  const alSincronizarRef = useRef(alSincronizar);

  useEffect(() => {
    alSincronizarRef.current = alSincronizar;
  }, [alSincronizar]);

  const recargarPendientes = useCallback(async () => {
    setPendientes(await listarCola().catch(() => []));
  }, []);

  const encolar = useCallback(
    async (pedido: CrearPedidoInput, mesaNumero: number | null) => {
      await agregarACola({ id: pedido.id, pedido, mesaNumero, creadoEn: new Date().toISOString() });
      await recargarPendientes();
    },
    [recargarPendientes],
  );

  const sincronizar = useCallback(async () => {
    if (!token || enCurso.current) return;
    enCurso.current = true;
    setSincronizando(true);
    setErrorSync(null);
    let aplicados = 0;
    try {
      for (;;) {
        const lote = (await listarCola()).slice(0, TAMANO_LOTE);
        if (lote.length === 0) break;
        const resultados = await sincronizarPedidos(
          lote.map((p) => p.pedido),
          token,
        );
        if (resultados.length === 0) break;

        const mesaDe = new Map(lote.map((p) => [p.id, p.mesaNumero]));
        const nuevosRechazos: PedidoRechazado[] = [];
        for (const r of resultados) {
          if (r.resultado === 'RECHAZADO') {
            nuevosRechazos.push({ id: r.id, mesaNumero: mesaDe.get(r.id) ?? null, motivo: r.motivo });
          } else {
            aplicados++;
          }
        }
        // CREADO, DUPLICADO y RECHAZADO salen de la cola: los dos primeros ya
        // están en el backend y reintentar un rechazo daría el mismo error.
        await quitarDeCola(resultados.map((r) => r.id));
        if (nuevosRechazos.length > 0) setRechazados((prev) => [...prev, ...nuevosRechazos]);
      }
      setEnLinea(true);
    } catch (err) {
      if (esErrorDeRed(err)) setEnLinea(false);
      else setErrorSync(err instanceof Error ? err.message : 'No se pudo sincronizar');
    } finally {
      enCurso.current = false;
      setSincronizando(false);
      await recargarPendientes();
      if (aplicados > 0) alSincronizarRef.current?.();
    }
  }, [token, recargarPendientes]);

  useEffect(() => {
    const alConectar = () => {
      setEnLinea(true);
      sincronizar();
    };
    const alDesconectar = () => setEnLinea(false);
    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    return () => {
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
    };
  }, [sincronizar]);

  // Al abrir la pantalla: cargar la cola y, si hay red, vaciarla.
  useEffect(() => {
    recargarPendientes().then(() => {
      if (navigator.onLine) sincronizar();
    });
  }, [recargarPendientes, sincronizar]);

  const hayPendientes = pendientes.length > 0;
  useEffect(() => {
    if (!hayPendientes) return;
    const intervalo = setInterval(() => {
      if (navigator.onLine) sincronizar();
    }, REINTENTO_MS);
    return () => clearInterval(intervalo);
  }, [hayPendientes, sincronizar]);

  return {
    enLinea,
    pendientes,
    sincronizando,
    rechazados,
    errorSync,
    encolar,
    sincronizar,
    marcarSinRed: () => setEnLinea(false),
    descartarRechazados: () => setRechazados([]),
  };
}
