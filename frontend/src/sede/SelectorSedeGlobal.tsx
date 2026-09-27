import { useAuth } from '../auth/AuthContext';
import { useSedeContext } from './SedeContext';

// DECISIÓN DE PROTOTIPO (Fase 7): selector flotante y global, montado una
// sola vez en App.tsx, en vez de agregarlo a cada página — así ninguna
// pantalla de Mesas/Cocina/Caja hay que tocarla para esto (ver
// docs/fases-siguientes.md, "Contratos de integración").
export function SelectorSedeGlobal() {
  const { usuario } = useAuth();
  const { sedes, sede, seleccionarSede } = useSedeContext();

  if (usuario?.rol !== 'ADMIN' || sedes.length <= 1) return null;

  return (
    <div className="selector-sede-global">
      <label htmlFor="selector-sede">Sede</label>
      <select id="selector-sede" value={sede?.id ?? ''} onChange={(e) => seleccionarSede(e.target.value)}>
        {sedes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
