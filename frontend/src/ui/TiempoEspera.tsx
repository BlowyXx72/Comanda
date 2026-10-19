import { useEffect, useState } from 'react';

// DECISIÓN DE PROTOTIPO: la propuesta no fija cuánto es "demorado"; 15 min
// es un umbral razonable para un pedido de cocina rápida.
const MINUTOS_DEMORA = 15;
const REFRESCO_MS = 30_000;

// Cuánto lleva esperando una comanda en el KDS. Se actualiza sola cada 30 s;
// al pasar el umbral cambia de color y lo dice en texto (no solo color).
export function TiempoEspera({ desde }: { desde: string }) {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), REFRESCO_MS);
    return () => clearInterval(intervalo);
  }, []);

  const minutos = Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 60_000));
  const demorado = minutos >= MINUTOS_DEMORA;
  const texto = minutos < 1 ? 'Recién llegado' : minutos < 60 ? `Hace ${minutos} min` : `Hace ${Math.floor(minutos / 60)} h`;

  return (
    <span className={`tiempo-espera${demorado ? ' tiempo-espera--demorado' : ''}`}>
      {texto}
      {demorado && ' · demorado'}
    </span>
  );
}
