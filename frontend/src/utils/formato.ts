export const formatearCOP = (valor: string | number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    Number(valor),
  );

// Cómo se identifica un pedido en cocina/caja: los de domicilio no tienen mesa.
export const etiquetaPedido = (pedido: { canal: string; mesa?: { numero: number } | null }) => {
  if (pedido.canal === 'DOMICILIO') return 'Domicilio';
  return pedido.mesa ? `Mesa ${pedido.mesa.numero}` : 'Sin mesa';
};
