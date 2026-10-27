import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useUltimoValor } from '../hooks/useUltimoValor';

// Fase 13B: vacío = mismo origen de la página (Nginx o el proxy de Vite).
const WS_URL = import.meta.env.VITE_WS_URL || window.location.origin;

export interface InventarioActualizado {
  sedeId: string;
  insumoId?: string;
  tipo?: 'ENTRADA' | 'SALIDA' | 'MERMA';
  cantidad?: string | number;
  pedidoId?: string;
}

interface UseInventarioSocketOptions {
  token: string | null;
  onInventarioActualizado?: (evento: InventarioActualizado) => void;
}

// Consumido por: /inventario (Fase 11, §6.2). Igual que useVentasSocket: el
// backend une cada socket autenticado a la room de su cadena en la conexión,
// no hace falta `sede:unirse` para recibir `inventario:actualizado`.
export function useInventarioSocket({ token, onInventarioActualizado }: UseInventarioSocketOptions) {
  const onInventarioActualizadoRef = useUltimoValor(onInventarioActualizado);

  useEffect(() => {
    if (!token) return;

    const socket: Socket = io(WS_URL, { auth: { token } });
    socket.on('inventario:actualizado', (evento: InventarioActualizado) =>
      onInventarioActualizadoRef.current?.(evento),
    );

    return () => {
      socket.disconnect();
    };
  }, [token, onInventarioActualizadoRef]);
}
