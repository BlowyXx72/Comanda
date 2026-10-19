import { useEffect, useState, type FormEvent } from 'react';
import {
  actualizarInsumo,
  crearInsumo,
  listarInsumos,
  listarProductos,
  listarReceta,
  obtenerExistenciasSede,
  registrarMovimientoInventario,
  reemplazarReceta,
  type ActualizarInsumoInput,
  type CrearInsumoInput,
  type ExistenciaInsumo,
  type Insumo,
  type ItemRecetaInput,
  type Producto,
  type TipoMovimientoManual,
} from '../api/comanda';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useInventarioSocket } from '../realtime/useInventarioSocket';
import { useSedeContext } from '../sede/SedeContext';

const INSUMO_VACIO: CrearInsumoInput = { nombre: '', unidad: '', costoUnitario: 0 };

// Fase 11 (§6.2): insumos, existencias por sede y receta de los productos.
// No hay selector de sede propio: esta página confía en el mismo selector
// global que ya usan /mesas y /caja (ver docs/fases-siguientes-2.md,
// "Contratos de integración" — Parte 1 no reinventa ese patrón).
export function InventarioPage() {
  const { token } = useAuth();
  const { sede } = useSedeContext();

  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [cargandoInsumos, setCargandoInsumos] = useState(true);
  const [nuevoInsumo, setNuevoInsumo] = useState<CrearInsumoInput>(INSUMO_VACIO);
  const [creandoInsumo, setCreandoInsumo] = useState(false);
  const [edicionInsumo, setEdicionInsumo] = useState<Record<string, ActualizarInsumoInput>>({});

  const [existencias, setExistencias] = useState<ExistenciaInsumo[]>([]);
  const [cargandoExistencias, setCargandoExistencias] = useState(true);
  const [movimientos, setMovimientos] = useState<Record<string, { tipo: TipoMovimientoManual; cantidad: number }>>({});

  const [productos, setProductos] = useState<Producto[]>([]);
  const [productoId, setProductoId] = useState('');
  const [receta, setReceta] = useState<ItemRecetaInput[]>([]);
  const [guardandoReceta, setGuardandoReceta] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const cargarInsumos = () => {
    if (!token) return;
    listarInsumos(token)
      .then(setInsumos)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los insumos'))
      .finally(() => setCargandoInsumos(false));
  };

  const cargarExistencias = () => {
    if (!token || !sede) return;
    obtenerExistenciasSede(sede.id, token)
      .then(setExistencias)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las existencias'))
      .finally(() => setCargandoExistencias(false));
  };

  useEffect(cargarInsumos, [token]);
  useEffect(cargarExistencias, [token, sede]);

  useEffect(() => {
    if (!token) return;
    listarProductos(token).then(setProductos).catch(() => {});
  }, [token]);

  useInventarioSocket({ token, onInventarioActualizado: cargarExistencias });

  const crearNuevoInsumo = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !nuevoInsumo.nombre.trim() || !nuevoInsumo.unidad.trim()) return;
    setCreandoInsumo(true);
    setError(null);
    try {
      await crearInsumo(nuevoInsumo, token);
      setNuevoInsumo(INSUMO_VACIO);
      cargarInsumos();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el insumo');
    } finally {
      setCreandoInsumo(false);
    }
  };

  const guardarEdicionInsumo = async (id: string) => {
    if (!token || !edicionInsumo[id]) return;
    setError(null);
    try {
      await actualizarInsumo(id, edicionInsumo[id], token);
      setEdicionInsumo((prev) => {
        const { [id]: _omitido, ...resto } = prev;
        return resto;
      });
      cargarInsumos();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el insumo');
    }
  };

  const registrarMovimiento = async (insumoId: string) => {
    const datos = movimientos[insumoId];
    if (!token || !sede || !datos || datos.cantidad <= 0) return;
    setError(null);
    try {
      await registrarMovimientoInventario({ sedeId: sede.id, insumoId, ...datos }, token);
      setMovimientos((prev) => {
        const { [insumoId]: _omitido, ...resto } = prev;
        return resto;
      });
      cargarExistencias();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar el movimiento');
    }
  };

  const seleccionarProducto = async (id: string) => {
    setProductoId(id);
    if (!token || !id) {
      setReceta([]);
      return;
    }
    try {
      const items = await listarReceta(id, token);
      setReceta(items.map((item) => ({ insumoId: item.insumoId, cantidad: Number(item.cantidad) })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar la receta');
    }
  };

  const agregarItemReceta = () => {
    const insumoDisponible = insumos.find((i) => !receta.some((r) => r.insumoId === i.id));
    if (!insumoDisponible) return;
    setReceta((prev) => [...prev, { insumoId: insumoDisponible.id, cantidad: 1 }]);
  };

  const cambiarItemReceta = (index: number, campo: keyof ItemRecetaInput, valor: string | number) => {
    setReceta((prev) => prev.map((item, i) => (i === index ? { ...item, [campo]: valor } : item)));
  };

  const quitarItemReceta = (index: number) => {
    setReceta((prev) => prev.filter((_, i) => i !== index));
  };

  const guardarReceta = async () => {
    if (!token || !productoId) return;
    setGuardandoReceta(true);
    setError(null);
    try {
      await reemplazarReceta(productoId, receta, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la receta');
    } finally {
      setGuardandoReceta(false);
    }
  };

  return (
    <div className="catalogo-page">
      <h1>Inventario</h1>
      {error && <p className="login-error">{error}</p>}

      <section>
        <h2>Insumos</h2>
        <form className="catalogo-form" onSubmit={crearNuevoInsumo}>
          <input
            placeholder="Nombre"
            value={nuevoInsumo.nombre}
            onChange={(e) => setNuevoInsumo({ ...nuevoInsumo, nombre: e.target.value })}
          />
          <input
            placeholder="Unidad (gramos, unidad, ml...)"
            value={nuevoInsumo.unidad}
            onChange={(e) => setNuevoInsumo({ ...nuevoInsumo, unidad: e.target.value })}
          />
          <input
            type="number"
            min="0"
            placeholder="Costo unitario"
            value={nuevoInsumo.costoUnitario || ''}
            onChange={(e) => setNuevoInsumo({ ...nuevoInsumo, costoUnitario: Number(e.target.value) })}
          />
          <button disabled={creandoInsumo} type="submit">
            {creandoInsumo ? 'Creando…' : 'Agregar insumo'}
          </button>
        </form>

        {cargandoInsumos ? (
          <p className="pantalla-info">Cargando insumos…</p>
        ) : (
          <table className="catalogo-tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Unidad</th>
                <th>Costo unitario</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {insumos.map((insumo) => {
                const cambios = edicionInsumo[insumo.id];
                return (
                  <tr key={insumo.id}>
                    <td>
                      <input
                        value={cambios?.nombre ?? insumo.nombre}
                        onChange={(e) =>
                          setEdicionInsumo((prev) => ({
                            ...prev,
                            [insumo.id]: { ...prev[insumo.id], nombre: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={cambios?.unidad ?? insumo.unidad}
                        onChange={(e) =>
                          setEdicionInsumo((prev) => ({
                            ...prev,
                            [insumo.id]: { ...prev[insumo.id], unidad: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={cambios?.costoUnitario ?? Number(insumo.costoUnitario)}
                        onChange={(e) =>
                          setEdicionInsumo((prev) => ({
                            ...prev,
                            [insumo.id]: { ...prev[insumo.id], costoUnitario: Number(e.target.value) },
                          }))
                        }
                      />
                    </td>
                    <td className="catalogo-acciones">
                      <button disabled={!cambios} onClick={() => guardarEdicionInsumo(insumo.id)}>
                        Guardar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Existencias {sede ? `— ${sede.nombre}` : ''}</h2>
        <p className="panel-nota">
          Cambia de sede con el selector de arriba. Un saldo negativo significa que la sede vendió más de lo que
          tenía registrado como ENTRADA (no se bloquea el cobro, ver docs/fases-siguientes-2.md Fase 11).
        </p>
        {cargandoExistencias ? (
          <p className="pantalla-info">Cargando existencias…</p>
        ) : (
          <table className="catalogo-tabla">
            <thead>
              <tr>
                <th>Insumo</th>
                <th>Existencia</th>
                <th>Movimiento manual</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {existencias.map((insumo) => {
                const movimiento = movimientos[insumo.id] ?? { tipo: 'ENTRADA' as const, cantidad: 0 };
                return (
                  <tr key={insumo.id}>
                    <td>
                      {insumo.nombre} ({insumo.unidad})
                    </td>
                    <td>{insumo.existencia}</td>
                    <td className="catalogo-acciones">
                      <select
                        value={movimiento.tipo}
                        onChange={(e) =>
                          setMovimientos((prev) => ({
                            ...prev,
                            [insumo.id]: { ...movimiento, tipo: e.target.value as TipoMovimientoManual },
                          }))
                        }
                      >
                        <option value="ENTRADA">ENTRADA</option>
                        <option value="MERMA">MERMA</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        value={movimiento.cantidad || ''}
                        onChange={(e) =>
                          setMovimientos((prev) => ({
                            ...prev,
                            [insumo.id]: { ...movimiento, cantidad: Number(e.target.value) },
                          }))
                        }
                      />
                    </td>
                    <td>
                      <button onClick={() => registrarMovimiento(insumo.id)}>Registrar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Receta de un producto</h2>
        <select value={productoId} onChange={(e) => seleccionarProducto(e.target.value)}>
          <option value="">Selecciona un producto…</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>

        {productoId && (
          <>
            <table className="catalogo-tabla">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Cantidad por unidad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {receta.map((item, index) => (
                  <tr key={item.insumoId}>
                    <td>
                      <select
                        value={item.insumoId}
                        onChange={(e) => cambiarItemReceta(index, 'insumoId', e.target.value)}
                      >
                        {insumos.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={item.cantidad}
                        onChange={(e) => cambiarItemReceta(index, 'cantidad', Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <button onClick={() => quitarItemReceta(index)}>Quitar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="catalogo-acciones">
              <button onClick={agregarItemReceta} disabled={receta.length >= insumos.length}>
                Agregar insumo
              </button>
              <button disabled={guardandoReceta} onClick={guardarReceta}>
                {guardandoReceta ? 'Guardando…' : 'Guardar receta'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
