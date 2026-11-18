import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  actualizarUsuario,
  crearUsuario,
  listarUsuarios,
  type ActualizarUsuarioInput,
  type CrearUsuarioInput,
  type UsuarioCadena,
} from '../api/comanda';
import { ApiError } from '../api/client';
import { useAuth, type Rol } from '../auth/AuthContext';
import { useSedeContext } from '../sede/SedeContext';

const ROLES: { valor: Rol; texto: string }[] = [
  { valor: 'MESERO', texto: 'Mesero' },
  { valor: 'CAJERO', texto: 'Cajero' },
  { valor: 'ADMIN', texto: 'Administrador' },
];

// Mismo mínimo que el backend (users/dto/crear-usuario.dto.ts).
const LARGO_MINIMO_CLAVE = 6;
// Valor del <select> para "todas las sedes" (sedeId null en el backend).
const TODAS = '';
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// sedeId undefined = el ADMIN aún no eligió sede: se sugiere una según el rol.
type FormNuevo = Omit<CrearUsuarioInput, 'sedeId'> & { sedeId?: string | null };
const FORM_VACIO: FormNuevo = { email: '', password: '', rol: 'MESERO' };

interface ErroresForm {
  email?: string;
  password?: string;
}

// Resaltado de la fila que acaba de cambiar (reusa .catalogo-fila--* de App.css).
type TipoCambio = 'nuevo' | 'guardado' | 'estado';
const DURACION_RESALTE_MS = 1600;

const mensajeDe = (err: unknown, porDefecto: string) => (err instanceof ApiError ? err.message : porDefecto);

// Un mesero o cajero sin sede asignada ve el selector de todas las sedes: si
// lo deja en otra, sus comandas no llegan a la cocina que espera. Se marca.
const sinSedeFija = (rol: Rol, sedeId: string | null | undefined) => rol !== 'ADMIN' && !sedeId;

function validarNuevo(nuevo: FormNuevo): ErroresForm {
  const errores: ErroresForm = {};
  if (!CORREO_VALIDO.test(nuevo.email.trim())) errores.email = 'Escribe un correo válido, p. ej. mesero2@demo.com.';
  if (nuevo.password.length < LARGO_MINIMO_CLAVE) {
    errores.password = `La contraseña necesita al menos ${LARGO_MINIMO_CLAVE} caracteres.`;
  }
  return errores;
}

// Gestión de usuarios de la cadena (solo ADMIN). Antes los usuarios solo
// salían del seed y no había cómo crear un mesero ni asignarle sede (Fase 17).
// Un cambio de sede, rol o estado aplica de inmediato: el backend lee la sede
// de la base en cada petición, no del JWT (auth/usuario-vigente.ts); la
// pantalla del usuario editado lo nota al recargar o al reconectar el socket.
// DECISIÓN DE PROTOTIPO: la propuesta no fija esta pantalla.
export function UsuariosPage() {
  const { token, usuario: actual } = useAuth();
  const { sedes } = useSedeContext();
  const [usuarios, setUsuarios] = useState<UsuarioCadena[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<FormNuevo>(FORM_VACIO);
  const [errores, setErrores] = useState<ErroresForm>({});
  const [creando, setCreando] = useState(false);
  const [edicion, setEdicion] = useState<Record<string, ActualizarUsuarioInput>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [resaltado, setResaltado] = useState<{
    id: string;
    tipo: TipoCambio;
  } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const campoEmail = useRef<HTMLInputElement>(null);
  const campoClave = useRef<HTMLInputElement>(null);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const resaltar = (id: string, tipo: TipoCambio) => {
    clearTimeout(temporizador.current);
    setResaltado({ id, tipo });
    temporizador.current = setTimeout(() => setResaltado(null), DURACION_RESALTE_MS);
  };

  const cargarUsuarios = () => {
    if (!token) return;
    listarUsuarios(token)
      .then(setUsuarios)
      .catch((err) => setError(mensajeDe(err, 'No se pudieron cargar los usuarios')))
      .finally(() => setCargando(false));
  };

  useEffect(cargarUsuarios, [token]);

  // A un mesero o cajero nuevo se le sugiere la primera sede.
  const sedeSugerida = (rol: Rol) => (rol === 'ADMIN' ? null : (sedes[0]?.id ?? null));
  const sedeNuevo = nuevo.sedeId === undefined ? sedeSugerida(nuevo.rol) : nuevo.sedeId;

  const editarCampo = (id: string, cambios: ActualizarUsuarioInput) => {
    setEdicion((prev) => ({ ...prev, [id]: { ...prev[id], ...cambios } }));
  };

  const descartarEdicion = (id: string) => {
    setEdicion((prev) => {
      const { [id]: _omitido, ...resto } = prev;
      return resto;
    });
  };

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const encontrados = validarNuevo(nuevo);
    setErrores(encontrados);
    if (encontrados.email || encontrados.password) {
      (encontrados.email ? campoEmail : campoClave).current?.focus();
      return;
    }
    setCreando(true);
    setError(null);
    setAviso(null);
    try {
      const creado = await crearUsuario({ ...nuevo, email: nuevo.email.trim(), sedeId: sedeNuevo }, token);
      setNuevo(FORM_VACIO);
      setAviso(`Usuario ${creado.email} creado. Ya puede iniciar sesión.`);
      resaltar(creado.id, 'nuevo');
      cargarUsuarios();
    } catch (err) {
      // Correo repetido (409): el error es de ese campo.
      if (err instanceof ApiError && err.statusCode === 409) {
        setErrores({ email: err.message });
        campoEmail.current?.focus();
      } else {
        setError(mensajeDe(err, 'No se pudo crear el usuario'));
      }
    } finally {
      setCreando(false);
    }
  };

  const guardar = async (u: UsuarioCadena, cambios: ActualizarUsuarioInput, tipo: TipoCambio) => {
    if (!token) return;
    if (cambios.password !== undefined && cambios.password.length < LARGO_MINIMO_CLAVE) {
      setError(`La nueva contraseña de ${u.email} necesita al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
      return;
    }
    setGuardando(u.id);
    setError(null);
    setAviso(null);
    try {
      await actualizarUsuario(u.id, cambios, token);
      if (tipo === 'guardado') descartarEdicion(u.id);
      setAviso(
        tipo === 'estado'
          ? `${u.email} ${cambios.activo ? 'reactivado' : 'desactivado'}.`
          : `Cambios de ${u.email} guardados. Aplican desde su próxima acción.`,
      );
      resaltar(u.id, tipo);
      cargarUsuarios();
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo actualizar el usuario'));
    } finally {
      setGuardando(null);
    }
  };

  const alternarActivo = (u: UsuarioCadena) => {
    // Confirmación solo al desactivar: lo saca de la sesión al instante.
    if (u.activo && !window.confirm(`¿Desactivar a ${u.email}? Su sesión deja de funcionar de inmediato.`)) return;
    guardar(u, { activo: !u.activo }, 'estado');
  };

  if (cargando) return <p className="pantalla-info">Cargando usuarios…</p>;

  const activos = usuarios.filter((u) => u.activo);
  const sinSede = activos.filter((u) => sinSedeFija(u.rol, u.sedeId)).length;

  return (
    <div className="catalogo-page usuarios-page">
      <h1>Usuarios de la cadena</h1>
      <p className="panel-nota">
        Un mesero o cajero con sede asignada solo opera en esa sede y recibe sus comandas. Con “Todas las sedes” elige
        la sede en la barra superior.
      </p>

      <section className="usuarios-alta" aria-labelledby="titulo-alta">
        <h2 id="titulo-alta">Nuevo usuario</h2>
        <form className="catalogo-form catalogo-form--usuarios" onSubmit={crear} noValidate>
          <label className="campo">
            <span className="campo-etiqueta">
              Correo <span aria-hidden="true">*</span>
            </span>
            <input
              ref={campoEmail}
              type="email"
              required
              autoComplete="off"
              placeholder="mesero2@demo.com"
              value={nuevo.email}
              aria-invalid={!!errores.email}
              aria-describedby={errores.email ? 'error-email' : undefined}
              onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
            />
            {errores.email && (
              <span id="error-email" className="campo-error">
                {errores.email}
              </span>
            )}
          </label>

          <label className="campo">
            <span className="campo-etiqueta">
              Contraseña <span aria-hidden="true">*</span>
            </span>
            <input
              ref={campoClave}
              type="password"
              required
              autoComplete="new-password"
              value={nuevo.password}
              aria-invalid={!!errores.password}
              aria-describedby={errores.password ? 'error-clave' : 'ayuda-clave'}
              onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
            />
            {errores.password ? (
              <span id="error-clave" className="campo-error">
                {errores.password}
              </span>
            ) : (
              <span id="ayuda-clave" className="campo-ayuda">
                Mínimo {LARGO_MINIMO_CLAVE} caracteres.
              </span>
            )}
          </label>

          <label className="campo">
            <span className="campo-etiqueta">Rol</span>
            <select
              value={nuevo.rol}
              onChange={(e) =>
                setNuevo({
                  ...nuevo,
                  rol: e.target.value as Rol,
                  sedeId: undefined,
                })
              }
            >
              {ROLES.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.texto}
                </option>
              ))}
            </select>
          </label>

          <label className="campo">
            <span className="campo-etiqueta">Sede</span>
            <select
              value={sedeNuevo ?? TODAS}
              aria-describedby="ayuda-sede"
              onChange={(e) => setNuevo({ ...nuevo, sedeId: e.target.value || null })}
            >
              <option value={TODAS}>Todas las sedes</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
            <span id="ayuda-sede" className={sinSedeFija(nuevo.rol, sedeNuevo) ? 'campo-aviso' : 'campo-ayuda'}>
              {sinSedeFija(nuevo.rol, sedeNuevo)
                ? 'Sin sede fija: podría tomar pedidos en otra sede.'
                : 'Donde toma pedidos o cobra.'}
            </span>
          </label>

          <button disabled={creando} type="submit" className="usuarios-crear">
            {creando ? 'Creando…' : 'Crear usuario'}
          </button>
        </form>
      </section>

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <p className="usuarios-aviso" role="status">
        {aviso}
      </p>

      <div className="usuarios-encabezado-tabla">
        <h2>Equipo</h2>
        <p className="panel-nota">
          {activos.length} {activos.length === 1 ? 'usuario activo' : 'usuarios activos'}
          {sinSede > 0 && ` · ${sinSede} sin sede fija`}
        </p>
      </div>

      {usuarios.length === 0 ? (
        <p className="pantalla-info">Todavía no hay usuarios. Crea el primero con el formulario de arriba.</p>
      ) : (
        // Región con scroll propio: en laptops la tabla se desplaza dentro de
        // su contenedor, no la página entera (en móvil pasa a tarjetas).
        <div className="usuarios-tabla-contenedor" role="region" aria-label="Usuarios de la cadena" tabIndex={0}>
          <table className="catalogo-tabla usuarios-tabla">
            <thead>
              <tr>
                <th scope="col">Correo</th>
                <th scope="col">Rol</th>
                <th scope="col">Sede</th>
                <th scope="col">Nueva contraseña</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="solo-lector">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const cambios = edicion[u.id];
                const esYo = u.id === actual?.id;
                const rol = cambios?.rol ?? u.rol;
                const sedeId = cambios && 'sedeId' in cambios ? cambios.sedeId : u.sedeId;
                const ocupado = guardando === u.id;
                return (
                  <tr
                    key={u.id}
                    className={
                      [
                        u.activo ? '' : 'catalogo-fila-inactiva',
                        cambios ? 'catalogo-fila--editando' : '',
                        resaltado?.id === u.id ? `catalogo-fila--${resaltado.tipo}` : '',
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                  >
                    <td data-etiqueta="Correo" className="usuarios-correo">
                      <span>{u.email}</span>
                      {esYo && <span className="chip chip--neutro">Tú</span>}
                    </td>
                    <td data-etiqueta="Rol">
                      <select
                        aria-label={`Rol de ${u.email}`}
                        value={rol}
                        disabled={esYo || ocupado}
                        title={esYo ? 'No puedes quitarte el rol de administrador' : undefined}
                        onChange={(e) => editarCampo(u.id, { rol: e.target.value as Rol })}
                      >
                        {ROLES.map((r) => (
                          <option key={r.valor} value={r.valor}>
                            {r.texto}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-etiqueta="Sede">
                      <select
                        aria-label={`Sede de ${u.email}`}
                        value={sedeId ?? TODAS}
                        disabled={ocupado}
                        onChange={(e) => editarCampo(u.id, { sedeId: e.target.value || null })}
                      >
                        <option value={TODAS}>Todas las sedes</option>
                        {sedes.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombre}
                          </option>
                        ))}
                      </select>
                      {u.activo && sinSedeFija(rol, sedeId) && <span className="chip chip--aviso">Sin sede fija</span>}
                    </td>
                    <td data-etiqueta="Nueva contraseña">
                      <input
                        type="password"
                        aria-label={`Nueva contraseña de ${u.email}`}
                        placeholder="Sin cambio"
                        autoComplete="new-password"
                        disabled={ocupado}
                        value={cambios?.password ?? ''}
                        onChange={(e) =>
                          editarCampo(u.id, {
                            password: e.target.value || undefined,
                          })
                        }
                      />
                    </td>
                    <td data-etiqueta="Estado">
                      <span className={`chip ${u.activo ? 'chip--ok' : 'chip--neutro'}`}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="catalogo-acciones">
                      <button
                        className="usuarios-guardar"
                        disabled={!cambios || ocupado}
                        onClick={() => cambios && guardar(u, cambios, 'guardado')}
                      >
                        {ocupado && cambios ? 'Guardando…' : 'Guardar'}
                      </button>
                      {cambios && !ocupado && (
                        <button className="boton-secundario" onClick={() => descartarEdicion(u.id)}>
                          Descartar
                        </button>
                      )}
                      <button
                        className={u.activo ? 'boton-peligro' : 'boton-secundario'}
                        disabled={esYo || ocupado}
                        title={esYo ? 'No puedes desactivar tu propio usuario' : undefined}
                        onClick={() => alternarActivo(u)}
                      >
                        {u.activo ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
