import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { DocumentoActualizado, Pedido } from '../api/comanda';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000';

export interface CatalogoActualizado {
  productoId: string;
  accion: 'CREADO' | 'ACTUALIZADO' | 'DESACTIVADO';
}

interface UseComandaSocketOptions {
  token: string | null;
  sedeId: string | null;
  onComandaNueva?: (pedido: Pedido) => void;
  onPedidoActualizado?: (pedido: Pedido) => void;
  // Fase 10 (CU-08): opcional porque solo lo usa /mesas. El backend ya une
  // todo socket autenticado a la room `cadena:{cadenaId}` al conectarse (ver
  // RealtimeGateway), así que reutiliza esta misma conexión en vez de abrir
  // una segunda solo para esto.
  onCatalogoActualizado?: (evento: CatalogoActualizado) => void;
  // Fase 11B: el worker terminó de validar un documento fiscal (lo usa /caja).
  onDocumentoActualizado?: (documento: DocumentoActualizado) => void;
}

// Consumido por: /cocina (comanda:nueva + pedido:actualizado), /caja
// (pedido:actualizado) y /mesas (los tres, incluido catalogo:actualizado).
// Por qué WebSocket y no polling: ver README, "Servicios telemáticos usados y por qué".
export function useComandaSocket({
  token,
  sedeId,
  onComandaNueva,
  onPedidoActualizado,
  onCatalogoActualizado,
  onDocumentoActualizado,
}: UseComandaSocketOptions) {
  const onComandaNuevaRef = useRef(onComandaNueva);
  const onPedidoActualizadoRef = useRef(onPedidoActualizado);
  const onCatalogoActualizadoRef = useRef(onCatalogoActualizado);
  onComandaNuevaRef.current = onComandaNueva;
  onPedidoActualizadoRef.current = onPedidoActualizado;
  onCatalogoActualizadoRef.current = onCatalogoActualizado;
  const onDocumentoActualizadoRef = useRef(onDocumentoActualizado);
  onDocumentoActualizadoRef.current = onDocumentoActualizado;

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
    socket.on('catalogo:actualizado', (evento: CatalogoActualizado) => onCatalogoActualizadoRef.current?.(evento));
    socket.on('documento:actualizado', (doc: DocumentoActualizado) => onDocumentoActualizadoRef.current?.(doc));

    return () => {
      socket.disconnect();
    };
  }, [token, sedeId]);
}
