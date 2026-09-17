import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Pedido } from '../api/comanda';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000';

interface UseComandaSocketOptions {
  token: string | null;
  sedeId: string | null;
  onComandaNueva?: (pedido: Pedido) => void;
  onPedidoActualizado?: (pedido: Pedido) => void;
}

// Consumido por: /cocina (comanda:nueva + pedido:actualizado) y /mesas
// (pedido:actualizado, para reflejar cambios hechos desde otra pantalla).
// Por qué WebSocket y no polling: ver README, "Servicios telemáticos usados y por qué".
export function useComandaSocket({ token, sedeId, onComandaNueva, onPedidoActualizado }: UseComandaSocketOptions) {
  const onComandaNuevaRef = useRef(onComandaNueva);
  const onPedidoActualizadoRef = useRef(onPedidoActualizado);
  onComandaNuevaRef.current = onComandaNueva;
  onPedidoActualizadoRef.current = onPedidoActualizado;

  useEffect(() => {
    if (!token || !sedeId) {
      return;
    }

    const socket: Socket = io(WS_URL, { auth: { token } });

    socket.on('connect', () => {
      socket.emit('sede:unirse', { sedeId });
    });
    socket.on('comanda:nueva', (pedido: Pedido) => onComandaNuevaRef.current?.(pedido));
    socket.on('pedido:actualizado', (pedido: Pedido) => onPedidoActualizadoRef.current?.(pedido));

    return () => {
      socket.disconnect();
    };
  }, [token, sedeId]);
}
