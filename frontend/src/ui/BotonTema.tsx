import { alternarTema, useTema } from '../tema/tema';
import { Icono } from './Icono';

// Botón de modo claro/oscuro. Lo usan la barra del personal, el login y el
// menú del comensal.
export function BotonTema({ className = '' }: { className?: string }) {
  const tema = useTema();
  const siguiente = tema === 'oscuro' ? 'claro' : 'oscuro';
  return (
    <button
      type="button"
      className={`boton-icono ${className}`}
      onClick={alternarTema}
      aria-label={`Cambiar a modo ${siguiente}`}
      title={`Cambiar a modo ${siguiente}`}
    >
      <Icono nombre={tema === 'oscuro' ? 'sol' : 'luna'} />
    </button>
  );
}
