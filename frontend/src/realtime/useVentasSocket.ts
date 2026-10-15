import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

// Fase 13B: vacío = mismo origen de la página (Nginx o el proxy de Vite).
const WS_URL = import.meta.env.VITE_WS_URL || window.location.origin;

export interface VentaRegistrada {
  sedeId: string;
  pedidoId: string;
  canal: string;
  total: string;
  fechaHora: string;
}

interface UseVentasSocketOptions {
  token: string | null;
  onVentaRegistrada?: (venta: VentaRegistrada) => void;
}

// Consumido por: /panel (Fase 9, CU-06). A diferencia de useComandaSocket
// (que pide unirse a una sede con `sede:unirse`), el backend une cada socket
// autenticado a la room de su propia cadena de una vez en la conexión, así
// que acá alcanza con escuchar `venta:registrada`.
export function useVentasSocket({ token, onVentaRegistrada }: UseVentasSocketOptions) {
  const onVentaRegistradaRef = useRef(onVentaRegistrada);
  onVentaRegistradaRef.current = onVentaRegistrada;

  useEffect(() => {
    if (!token) return;

    const socket: Socket = io(WS_URL, { auth: { token } });
    socket.on('venta:registrada', (venta: VentaRegistrada) => onVentaRegistradaRef.current?.(venta));

    return () => {
      socket.disconnect();
    };
  }, [token]);
}
