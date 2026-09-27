import { useEffect, useState, type FormEvent } from 'react';
import {
  actualizarProducto,
  crearProducto,
  desactivarProducto,
  listarProductos,
  type ActualizarProductoInput,
  type CrearProductoInput,
  type Producto,
} from '../api/comanda';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const FORM_VACIO: CrearProductoInput = { nombre: '', precio: 0, categoria: '' };

// Fase 10 (CU-08): "La administración actualiza precios o el menú una sola
// vez y el cambio se propaga a todas las sedes". Esta pantalla es la única
// que escribe en el catálogo; /mesas lo escucha en vivo vía
// `catalogo:actualizado` (ver useComandaSocket). Como quien edita acá es la
// misma persona que ve el resultado, no hace falta abrir un socket: cada
// mutación recarga la tabla directamente.
export function CatalogoPage() {
  const { token } = useAuth();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<CrearProductoInput>(FORM_VACIO);
  const [creando, setCreando] = useState(false);
  const [edicion, setEdicion] = useState<Record<string, ActualizarProductoInput>>({});

  const cargarProductos = () => {
    if (!token) return;
    listarProductos(token, true)
      .then(setProductos)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el catálogo'))
      .finally(() => setCargando(false));
  };

  useEffect(cargarProductos, [token]);

  const editarCampo = (id: string, campo: keyof ActualizarProductoInput, valor: string | number) => {
    setEdicion((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  };

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !nuevo.nombre.trim() || !nuevo.categoria.trim() || nuevo.precio <= 0) return;
    setCreando(true);
    setError(null);
    try {
      await crearProducto(nuevo, token);
      setNuevo(FORM_VACIO);
      cargarProductos();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el producto');
    } finally {
      setCreando(false);
    }
  };

  const guardarEdicion = async (id: string) => {
    if (!token || !edicion[id]) return;
    setError(null);
    try {
      await actualizarProducto(id, edicion[id], token);
      setEdicion((prev) => {
        const { [id]: _omitido, ...resto } = prev;
        return resto;
      });
      cargarProductos();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el producto');
    }
  };

  const alternarActivo = async (producto: Producto) => {
    if (!token) return;
    setError(null);
    try {
      if (producto.activo) {
        await desactivarProducto(producto.id, token);
      } else {
        await actualizarProducto(producto.id, { activo: true }, token);
      }
      cargarProductos();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado del producto');
    }
  };

  if (cargando) return <p className="pantalla-info">Cargando catálogo…</p>;

  return (
    <div className="catalogo-page">
      <h1>Catálogo centralizado</h1>
      <p className="panel-nota">Los cambios se aplican a las 3 sedes de la cadena al instante.</p>

      <form className="catalogo-form" onSubmit={crear}>
        <input
          placeholder="Nombre"
          value={nuevo.nombre}
          onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
        />
        <input
          placeholder="Categoría"
          value={nuevo.categoria}
          onChange={(e) => setNuevo({ ...nuevo, categoria: e.target.value })}
        />
        <input
          type="number"
          min="0"
          step="1"
          placeholder="Precio"
          value={nuevo.precio || ''}
          onChange={(e) => setNuevo({ ...nuevo, precio: Number(e.target.value) })}
        />
        <button disabled={creando} type="submit">
          {creando ? 'Creando…' : 'Agregar producto'}
        </button>
      </form>

      {error && <p className="login-error">{error}</p>}

      <table className="catalogo-tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Categoría</th>
            <th>Precio</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {productos.map((producto) => {
            const cambios = edicion[producto.id];
            return (
              <tr key={producto.id} className={producto.activo ? undefined : 'catalogo-fila-inactiva'}>
                <td>
                  <input
                    value={cambios?.nombre ?? producto.nombre}
                    onChange={(e) => editarCampo(producto.id, 'nombre', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    value={cambios?.categoria ?? producto.categoria}
                    onChange={(e) => editarCampo(producto.id, 'categoria', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={cambios?.precio ?? Number(producto.precio)}
                    onChange={(e) => editarCampo(producto.id, 'precio', Number(e.target.value))}
                  />
                </td>
                <td>{producto.activo ? 'Activo' : 'Inactivo'}</td>
                <td className="catalogo-acciones">
                  <button disabled={!cambios} onClick={() => guardarEdicion(producto.id)}>
                    Guardar
                  </button>
                  <button onClick={() => alternarActivo(producto)}>{producto.activo ? 'Desactivar' : 'Reactivar'}</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
