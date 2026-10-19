import { useEffect, useRef, useState } from 'react';
import { useSedeContext } from '../sede/SedeContext';
import { Icono } from './Icono';

const DURACION_MS = 2200;

// Aviso breve al cambiar de sede (selector de la barra): confirma a dónde se
// pasó mientras el contenido entra con su animación (ProtectedRoute remonta
// la pantalla con `key={sede.id}`). No aparece en la carga inicial.
// role="status": los lectores de pantalla lo anuncian sin mover el foco.
export function AvisoCambioSede() {
  const { sede } = useSedeContext();
  const anterior = useRef<string | null>(null);
  const [visible, setVisible] = useState<string | null>(null);

  useEffect(() => {
    if (!sede) return;
    const previa = anterior.current;
    anterior.current = sede.id;
    if (!previa || previa === sede.id) return;
    setVisible(sede.nombre);
    const temporizador = setTimeout(() => setVisible(null), DURACION_MS);
    return () => clearTimeout(temporizador);
  }, [sede]);

  return (
    <div className="aviso-sede" role="status" aria-live="polite">
      {visible && (
        <span key={visible} className="aviso-sede-pastilla">
          <Icono nombre="ubicacion" tamano={18} />
          <span>
            Ahora en <strong>{visible}</strong>
          </span>
        </span>
      )}
    </div>
  );
}
