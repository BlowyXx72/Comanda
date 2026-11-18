import { useEffect, useState, type FormEvent } from 'react';
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

// sedeId undefined = el ADMIN aún no eligió sede: se sugiere una según el rol.
type FormNuevo = Omit<CrearUsuarioInput, 'sedeId'> & { sedeId?: string | null };
const FORM_VACIO: FormNuevo = { email: '', password: '', rol: 'MESERO' };

const mensajeDe = (err: unknown, porDefecto: string) => (err instanceof ApiError ? err.message : porDefecto);

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
  const [creando, setCreando] = useState(false);
  const [edicion, setEdicion] = useState<Record<string, ActualizarUsuarioInput>>({});

  const cargarUsuarios = () => {
    if (!token) return;
    listarUsuarios(token)
      .then(setUsuarios)
      .catch((err) => setError(mensajeDe(err, 'No se pudieron cargar los usuarios')))
      .finally(() => setCargando(false));
  };

  useEffect(cargarUsuarios, [token]);

  // Al crear un mesero o cajero, sugerir la primera sede: sin sede asignada
  // vería el selector de todas, que es justo lo que causaba desajustes.
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
    if (!nuevo.email.trim() || nuevo.password.length < LARGO_MINIMO_CLAVE) {
      setError(`Escribe un correo y una contraseña de al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
      return;
    }
    setCreando(true);
    setError(null);
    setAviso(null);
    try {
      const creado = await crearUsuario({ ...nuevo, sedeId: sedeNuevo }, token);
      setNuevo(FORM_VACIO);
      setAviso(`Usuario ${creado.email} creado.`);
      cargarUsuarios();
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo crear el usuario'));
    } finally {
      setCreando(false);
    }
  };

  const guardar = async (u: UsuarioCadena, cambios: ActualizarUsuarioInput) => {
    if (!token) return;
    if (cambios.password !== undefined && cambios.password.length < LARGO_MINIMO_CLAVE) {
      setError(`La nueva contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
      return;
    }
    setError(null);
    setAviso(null);
    try {
      await actualizarUsuario(u.id, cambios, token);
      descartarEdicion(u.id);
      setAviso(`Cambios de ${u.email} guardados.`);
      cargarUsuarios();
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo actualizar el usuario'));
    }
  };

  if (cargando) return <p className="pantalla-info">Cargando usuarios…</p>;

  return (
    <div className="catalogo-page">
      <h1>Usuarios de la cadena</h1>
      <p className="panel-nota">
        Un mesero o cajero con sede asignada solo opera en esa sede y recibe sus comandas. “Todas las sedes” le muestra
        el selector de sede en la barra superior.
      </p>

      <form className="catalogo-form catalogo-form--usuarios" onSubmit={crear}>
        <input
          type="email"
          placeholder="Correo"
          autoComplete="off"
          value={nuevo.email}
          onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
        />
        <input
          type="password"
          placeholder={`Contraseña (mín. ${LARGO_MINIMO_CLAVE})`}
          autoComplete="new-password"
          value={nuevo.password}
          onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
        />
        <select
          aria-label="Rol"
          value={nuevo.rol}
          onChange={(e) => {
            const rol = e.target.value as Rol;
            setNuevo({ ...nuevo, rol, sedeId: undefined });
          }}
        >
          {ROLES.map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.texto}
            </option>
          ))}
        </select>
        <select
          aria-label="Sede"
          value={sedeNuevo ?? TODAS}
          onChange={(e) => setNuevo({ ...nuevo, sedeId: e.target.value || null })}
        >
          <option value={TODAS}>Todas las sedes</option>
          {sedes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <button disabled={creando} type="submit">
          {creando ? 'Creando…' : 'Crear usuario'}
        </button>
      </form>

      {error && <p className="login-error">{error}</p>}
      {aviso && <p className="panel-nota">{aviso}</p>}

      <table className="catalogo-tabla">
        <thead>
          <tr>
            <th>Correo</th>
            <th>Rol</th>
            <th>Sede</th>
            <th>Nueva contraseña</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => {
            const cambios = edicion[u.id];
            const esYo = u.id === actual?.id;
            const sedeId = cambios && 'sedeId' in cambios ? cambios.sedeId : u.sedeId;
            return (
              <tr
                key={u.id}
                className={[u.activo ? '' : 'catalogo-fila-inactiva', cambios ? 'catalogo-fila--editando' : '']
                  .filter(Boolean)
                  .join(' ') || undefined}
              >
                <td>
                  {u.email}
                  {esYo && <em> (tú)</em>}
                </td>
                <td>
                  <select
                    aria-label={`Rol de ${u.email}`}
                    value={cambios?.rol ?? u.rol}
                    disabled={esYo}
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
                <td>
                  <select
                    aria-label={`Sede de ${u.email}`}
                    value={sedeId ?? TODAS}
                    onChange={(e) => editarCampo(u.id, { sedeId: e.target.value || null })}
                  >
                    <option value={TODAS}>Todas las sedes</option>
                    {sedes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="password"
                    aria-label={`Nueva contraseña de ${u.email}`}
                    placeholder="Sin cambio"
                    autoComplete="new-password"
                    value={cambios?.password ?? ''}
                    onChange={(e) => editarCampo(u.id, { password: e.target.value || undefined })}
                  />
                </td>
                <td>{u.activo ? 'Activo' : 'Inactivo'}</td>
                <td className="catalogo-acciones">
                  <button disabled={!cambios} onClick={() => cambios && guardar(u, cambios)}>
                    Guardar
                  </button>
                  <button
                    disabled={esYo}
                    title={esYo ? 'No puedes desactivar tu propio usuario' : undefined}
                    onClick={() => guardar(u, { activo: !u.activo })}
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
  );
}
