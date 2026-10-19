import { useEffect, useState } from 'react';
import {
  obtenerReporteConsolidado,
  obtenerReporteFranjas,
  obtenerReporteProductos,
  type AgrupacionReporte,
  type ReporteConsolidado,
  type ReporteFranjas,
  type ReporteProductos,
} from '../api/comanda';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { BotonResumenDiario } from '../correo/BotonResumenDiario';
import { useVentasSocket, type VentaRegistrada } from '../realtime/useVentasSocket';
import { formatearCOP } from '../utils/formato';

// Fase 9 (CU-06): "El dueño consulta desde cualquier lugar el consolidado de
// ventas de todas las sedes en tiempo real". Por defecto muestra el día de
// hoy; se actualiza solo al llegar `venta:registrada` (sin recargar ni
// hacer polling), igual que /cocina y /caja con los eventos por sede.
//
// Fase 13: el reporte sale de la réplica de lectura, que puede ir unos ms
// atrás del primario. Por eso el evento se SUMA en memoria con su propio
// payload y no dispara un nuevo GET /reportes/consolidado (que podría no ver
// aún el pago recién hecho).
const aCentavos = (valor: string) => Math.round(Number(valor) * 100);
const deCentavos = (centavos: number) => (centavos / 100).toFixed(2);

// Fase 14: mismo criterio de día que ReportsService (America/Bogota, UTC-5 fijo
// sin horario de verano). Devuelve YYYY-MM-DD.
const diaBogota = (iso: string) => new Date(Date.parse(iso) - 5 * 3600 * 1000).toISOString().slice(0, 10);

function sumarVenta(reporte: ReporteConsolidado, venta: VentaRegistrada, agrupacion: AgrupacionReporte): ReporteConsolidado {
  const dia = diaBogota(venta.fechaHora);
  if (dia < reporte.desde || dia > reporte.hasta) return reporte; // fuera del rango mostrado
  // Con agrupacion=mes la clave de fila es YYYY-MM, igual que el backend.
  const fecha = agrupacion === 'mes' ? dia.slice(0, 7) : dia;

  const centavos = aCentavos(venta.total);
  const existe = reporte.filas.some((f) => f.sedeId === venta.sedeId && f.fecha === fecha && f.canal === venta.canal);
  const filas = existe
    ? reporte.filas.map((f) =>
        f.sedeId === venta.sedeId && f.fecha === fecha && f.canal === venta.canal
          ? { ...f, cantidadPedidos: f.cantidadPedidos + 1, totalVentas: deCentavos(aCentavos(f.totalVentas) + centavos) }
          : f,
      )
    : [
        ...reporte.filas,
        {
          sedeId: venta.sedeId,
          sedeNombre: venta.sedeNombre,
          fecha,
          canal: venta.canal,
          cantidadPedidos: 1,
          totalVentas: deCentavos(centavos),
        },
      ].sort(
        (a, b) => a.sedeNombre.localeCompare(b.sedeNombre) || a.fecha.localeCompare(b.fecha) || a.canal.localeCompare(b.canal),
      );

  return { ...reporte, filas, totalGeneral: deCentavos(aCentavos(reporte.totalGeneral) + centavos) };
}

export function PanelPage() {
  const { token } = useAuth();
  const [reporte, setReporte] = useState<ReporteConsolidado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agrupacion, setAgrupacion] = useState<AgrupacionReporte>('dia');
  const [productos, setProductos] = useState<ReporteProductos | null>(null);
  const [franjas, setFranjas] = useState<ReporteFranjas | null>(null);

  // El consolidado se vuelve a pedir solo al cambiar token o agrupación (nunca
  // por un evento del socket). Productos y franjas se cargan una vez: el
  // payload de venta:registrada no trae el detalle, así que no se suman en vivo.
  useEffect(() => {
    if (!token) return;
    obtenerReporteConsolidado(token, undefined, undefined, agrupacion)
      .then((r) => {
        setReporte(r);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el panel'))
      .finally(() => setCargando(false));
  }, [token, agrupacion]);

  useEffect(() => {
    if (!token) return;
    obtenerReporteProductos(token).then(setProductos).catch(() => setProductos(null));
    obtenerReporteFranjas(token).then(setFranjas).catch(() => setFranjas(null));
  }, [token]);

  useVentasSocket({
    token,
    onVentaRegistrada: (venta) => setReporte((actual) => (actual ? sumarVenta(actual, venta, agrupacion) : actual)),
  });

  if (cargando) return <p className="pantalla-info">Cargando panel…</p>;
  if (error || !reporte) return <p className="pantalla-info">{error ?? 'No se pudo cargar el panel.'}</p>;

  return (
    <div className="panel-page">
      <h1>Panel consolidado</h1>
      <BotonResumenDiario />
      <p className="panel-rango">
        {reporte.desde === reporte.hasta ? reporte.desde : `${reporte.desde} — ${reporte.hasta}`}
      </p>

      <label className="panel-agrupacion">
        Agrupar por{' '}
        <select value={agrupacion} onChange={(e) => setAgrupacion(e.target.value as AgrupacionReporte)}>
          <option value="dia">Día</option>
          <option value="mes">Mes</option>
        </select>
      </label>

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

      <h2>Ventas por producto</h2>
      <table className="panel-tabla">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {!productos || productos.filas.length === 0 ? (
            <tr>
              <td colSpan={3} className="panel-nota">
                Sin ventas de productos en el rango.
              </td>
            </tr>
          ) : (
            productos.filas.map((fila) => (
              <tr key={fila.productoId}>
                <td>{fila.productoNombre}</td>
                <td>{fila.cantidadVendida}</td>
                <td>{formatearCOP(fila.total)}</td>
              </tr>
            ))
          )}
        </tbody>
        {productos && (
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td>{formatearCOP(productos.totalGeneral)}</td>
            </tr>
          </tfoot>
        )}
      </table>

      <h2>Ventas por franja horaria</h2>
      <table className="panel-tabla">
        <thead>
          <tr>
            <th>Hora</th>
            <th>Pedidos</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {!franjas || franjas.filas.length === 0 ? (
            <tr>
              <td colSpan={3} className="panel-nota">
                Sin ventas por franja en el rango.
              </td>
            </tr>
          ) : (
            franjas.filas.map((fila) => (
              <tr key={fila.hora}>
                <td>{`${String(fila.hora).padStart(2, '0')}:00`}</td>
                <td>{fila.cantidadPedidos}</td>
                <td>{formatearCOP(fila.totalVentas)}</td>
              </tr>
            ))
          )}
        </tbody>
        {franjas && (
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td>{formatearCOP(franjas.totalGeneral)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
