import { useCallback, useEffect, useRef, useState } from 'react';
import { reservarRangoOffline, sincronizarPagos, type MedioPago, type Pedido } from '../api/comanda';
import { esErrorDeRed } from '../offline/cache';
import { cobrarConConsecutivo, guardarRango, listarCobros, numerosDisponibles, quitarCobros, type CobroPendiente } from './db';

// Mismo tope que SyncPedidosDto.pagos en el backend (@ArrayMaxSize(50)).
const TAMANO_LOTE = 50;
// Igual que la cola del mesero (useColaOffline): reintento periódico porque
// `navigator.onLine` puede decir "en línea" sin que el backend responda.
const REINTENTO_MS = 15_000;
// DECISIÓN DE PROTOTIPO: con menos de 5 números libres la caja pide otro
// bloque (de 20, el default del backend) mientras tenga red.
const MINIMO_DISPONIBLES = 5;
const CLAVE_DISPOSITIVO = 'comanda.dispositivoId';

// Identidad de esta caja para el backend: un UUID por navegador, guardado la
// primera vez. Los bloques de consecutivos se reservan a nombre de él.
function dispositivoId(): string {
  let id = localStorage.getItem(CLAVE_DISPOSITIVO);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLAVE_DISPOSITIVO, id);
  }
  return id;
}

export interface CobroRechazado {
  id: string;
  consecutivo: number;
  etiqueta: string;
  motivo: string;
}

// Cobro sin conexión de la caja (Fase 16, CU-07, §6.3). Mientras hay red,
// mantiene reservado un bloque de consecutivos fiscales para la sede; sin red,
// numera el cobro con ese bloque y lo guarda en IndexedDB; al volver la red,
// lo envía por POST /sync. `alSincronizar` se llama si el backend aplicó al
// menos un cobro.
export function useCobroOffline(
  token: string | null,
  sedeId: string | null,
  etiquetaDe: (pedido: Pedido) => string,
  alSincronizar?: () => void,
) {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  const [pendientes, setPendientes] = useState<CobroPendiente[]>([]);
  const [disponibles, setDisponibles] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [rechazados, setRechazados] = useState<CobroRechazado[]>([]);
  const [errorSync, setErrorSync] = useState<string | null>(null);
  const enCurso = useRef(false);
  const alSincronizarRef = useRef(alSincronizar);
  const etiquetaDeRef = useRef(etiquetaDe);

  useEffect(() => {
    alSincronizarRef.current = alSincronizar;
    etiquetaDeRef.current = etiquetaDe;
  });

  const recargar = useCallback(async () => {
    const [cobros, libres] = await Promise.all([
      listarCobros().catch(() => []),
      sedeId ? numerosDisponibles(sedeId).catch(() => 0) : Promise.resolve(0),
    ]);
    setPendientes(cobros);
    setDisponibles(libres);
  }, [sedeId]);

  // Pide otro bloque si quedan pocos números. Sin red no hace nada: se usará
  // lo que ya esté reservado.
  const asegurarRango = useCallback(async () => {
    if (!token || !sedeId) return;
    try {
      if ((await numerosDisponibles(sedeId)) >= MINIMO_DISPONIBLES) return;
      await guardarRango(await reservarRangoOffline(sedeId, dispositivoId(), token));
    } catch {
      // Sin red, sin IndexedDB o rango de la sede agotado: el cobro en línea
      // sigue funcionando y el aviso de la caja muestra cuántos números hay.
    } finally {
      await recargar();
    }
  }, [token, sedeId, recargar]);

  const sincronizar = useCallback(async () => {
    if (!token || enCurso.current) return;
    enCurso.current = true;
    setSincronizando(true);
    setErrorSync(null);
    let aplicados = 0;
    try {
      for (;;) {
        const lote = (await listarCobros()).slice(0, TAMANO_LOTE);
        if (lote.length === 0) break;
        const resultados = await sincronizarPagos(
          lote.map((c) => c.pago),
          token,
        );
        if (resultados.length === 0) break;

        const cobroDe = new Map(lote.map((c) => [c.id, c]));
        const nuevosRechazos: CobroRechazado[] = [];
        for (const r of resultados) {
          const cobro = cobroDe.get(r.id);
          if (r.resultado === 'RECHAZADO') {
            nuevosRechazos.push({
              id: r.id,
              consecutivo: cobro?.pago.consecutivo ?? 0,
              etiqueta: cobro ? etiquetaDeRef.current(cobro.pedido) : r.id.slice(0, 8),
              motivo: r.motivo,
            });
          } else {
            aplicados++;
          }
        }
        // Igual que la cola del mesero: un rechazo no se reintenta (daría el
        // mismo error), se le muestra al cajero para que lo resuelva a mano.
        await quitarCobros(resultados.map((r) => r.id));
        if (nuevosRechazos.length > 0) setRechazados((prev) => [...prev, ...nuevosRechazos]);
      }
      setEnLinea(true);
    } catch (err) {
      if (esErrorDeRed(err)) setEnLinea(false);
      else setErrorSync(err instanceof Error ? err.message : 'No se pudieron sincronizar los cobros');
    } finally {
      enCurso.current = false;
      setSincronizando(false);
      await recargar();
      if (aplicados > 0) alSincronizarRef.current?.();
    }
  }, [token, recargar]);

  // Registra el cobro en la caja sin hablar con el backend. Devuelve null si
  // la caja no tiene números reservados para la sede.
  const cobrarSinConexion = useCallback(
    async (pedido: Pedido, medio: MedioPago) => {
      if (!sedeId) return null;
      const cobro = await cobrarConConsecutivo(sedeId, (consecutivo) => {
        const id = crypto.randomUUID();
        return {
          id,
          pedido,
          pago: {
            id,
            pedidoId: pedido.id,
            medio,
            monto: Number(pedido.total),
            consecutivo,
            dispositivoId: dispositivoId(),
            fechaHora: new Date().toISOString(),
          },
        };
      });
      setEnLinea(false);
      await recargar();
      return cobro;
    },
    [sedeId, recargar],
  );

  useEffect(() => {
    const alConectar = () => {
      setEnLinea(true);
      sincronizar().then(asegurarRango);
    };
    const alDesconectar = () => setEnLinea(false);
    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    return () => {
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
    };
  }, [sincronizar, asegurarRango]);

  // Al abrir la caja (o cambiar de sede): vaciar la cola si hay red y dejar
  // un bloque de consecutivos reservado.
  useEffect(() => {
    listarCobros()
      .catch(() => [])
      .then((cobros) => {
        setPendientes(cobros);
        if (navigator.onLine) return sincronizar();
      })
      .then(asegurarRango);
  }, [sincronizar, asegurarRango]);

  const hayPendientes = pendientes.length > 0;
  useEffect(() => {
    if (!hayPendientes) return;
    const intervalo = setInterval(() => {
      if (navigator.onLine) sincronizar().then(asegurarRango);
    }, REINTENTO_MS);
    return () => clearInterval(intervalo);
  }, [hayPendientes, sincronizar, asegurarRango]);

  return {
    enLinea,
    pendientes,
    disponibles,
    sincronizando,
    rechazados,
    errorSync,
    cobrarSinConexion,
    sincronizar,
    asegurarRango,
    descartarRechazados: () => setRechazados([]),
  };
}
