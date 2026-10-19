export const formatearCOP = (valor: string | number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    Number(valor),
  );

// Cómo se identifica un pedido en cocina/caja: los de domicilio y plataforma
// no tienen mesa. Los de plataforma (Fase 12B) muestran el id de la
// plataforma, que es como el domiciliario lo va a reclamar.
export const etiquetaPedido = (pedido: {
  canal: string;
  mesa?: { numero: number } | null;
  referenciaExterna?: string | null;
}) => {
  if (pedido.canal === 'DOMICILIO') return 'Domicilio';
  if (pedido.canal === 'PLATAFORMA') return pedido.referenciaExterna ? `Plataforma · ${pedido.referenciaExterna}` : 'Plataforma';
  return pedido.mesa ? `Mesa ${pedido.mesa.numero}` : 'Sin mesa';
};

// Texto legible de cada estado del pedido para badges y listas.
const TEXTO_ESTADO_PEDIDO: Record<string, string> = {
  ABIERTO: 'Abierto',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Listo',
  PAGADO: 'Pagado',
};

export const textoEstadoPedido = (estado: string) => TEXTO_ESTADO_PEDIDO[estado] ?? estado;
