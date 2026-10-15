import { useState } from 'react';
import { enviarResumenDiario } from '../api/comanda';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

// Fase 14B (§5.2, SMTP): el resumen diario sale solo a las 23:00 (Bogotá);
// este botón lo dispara a mano para la demo. Llega a la bandeja de Mailpit
// (http://localhost:8025) de los ADMIN de la cadena.
// Componente aparte para que /panel (Parte 1) solo gane una línea.
export function BotonResumenDiario() {
  const { token } = useAuth();
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const enviar = async () => {
    if (!token) return;
    setEnviando(true);
    setMensaje(null);
    try {
      await enviarResumenDiario(token);
      setMensaje('Encolado: llega en unos segundos a la bandeja de los ADMIN.');
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'No se pudo encolar el resumen');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <p className="panel-nota">
      <button type="button" onClick={enviar} disabled={enviando}>
        {enviando ? 'Encolando…' : 'Enviar resumen del día por correo'}
      </button>{' '}
      {mensaje}
    </p>
  );
}
