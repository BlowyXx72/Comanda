import { useAuth } from '../auth/AuthContext';
import { useSedeContext } from './SedeContext';

// DECISIÓN DE PROTOTIPO (Fase 7): selector global en vez de agregarlo a cada
// página — así ninguna pantalla de Mesas/Cocina/Caja hay que tocarla para
// esto (ver docs/fases-siguientes.md, "Contratos de integración"). Desde el
// rediseño vive dentro de la barra superior (ui/BarraSuperior.tsx).
export function SelectorSedeGlobal() {
  const { usuario } = useAuth();
  const { sedes, sede, seleccionarSede } = useSedeContext();

  // Multisede para cualquier rol sin sede asignada (Fase 17: sedeId null =
  // todas las sedes de la cadena, y el backend lo permite). Un mesero o cajero
  // con sede asignada solo recibe esa en GET /sedes, así que no ve selector.
  if (usuario?.sedeId || sedes.length <= 1) return null;

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
