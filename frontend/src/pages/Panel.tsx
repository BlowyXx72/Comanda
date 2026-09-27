import { useEffect, useState } from 'react';
import { obtenerReporteConsolidado, type ReporteConsolidado } from '../api/comanda';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useVentasSocket } from '../realtime/useVentasSocket';
import { formatearCOP } from '../utils/formato';

// Fase 9 (CU-06): "El dueño consulta desde cualquier lugar el consolidado de
// ventas de todas las sedes en tiempo real". Por defecto muestra el día de
// hoy; se actualiza solo al llegar `venta:registrada` (sin recargar ni
// hacer polling), igual que /cocina y /caja con los eventos por sede.
export function PanelPage() {
  const { token } = useAuth();
  const [reporte, setReporte] = useState<ReporteConsolidado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarReporte = () => {
    if (!token) return;
    obtenerReporteConsolidado(token)
      .then(setReporte)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el panel'))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargarReporte();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useVentasSocket({ token, onVentaRegistrada: cargarReporte });

  if (cargando) return <p className="pantalla-info">Cargando panel…</p>;
  if (error || !reporte) return <p className="pantalla-info">{error ?? 'No se pudo cargar el panel.'}</p>;

  return (
    <div className="panel-page">
      <h1>Panel consolidado</h1>
      <p className="panel-rango">
        {reporte.desde === reporte.hasta ? reporte.desde : `${reporte.desde} — ${reporte.hasta}`}
      </p>

      <table className="panel-tabla">
        <thead>
          <tr>
            <th>Sede</th>
            <th>Fecha</th>
            <th>Canal</th>
            <th>Pedidos</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {reporte.filas.length === 0 ? (
            <tr>
              <td colSpan={5} className="panel-nota">
                Sin ventas todavía en el rango seleccionado.
              </td>
            </tr>
          ) : (
            reporte.filas.map((fila) => (
              <tr key={`${fila.sedeId}-${fila.fecha}-${fila.canal}`}>
                <td>{fila.sedeNombre}</td>
                <td>{fila.fecha}</td>
                <td>{fila.canal}</td>
                <td>{fila.cantidadPedidos}</td>
                <td>{formatearCOP(fila.totalVentas)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>Total</td>
            <td>{formatearCOP(reporte.totalGeneral)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
