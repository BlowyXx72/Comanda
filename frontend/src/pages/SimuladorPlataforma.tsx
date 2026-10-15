import { useEffect, useState, type FormEvent } from 'react';
import {
  enviarPedidoPlataforma,
  listarAcusesPlataforma,
  obtenerCatalogoPlataforma,
  type AcusePlataforma,
  type CatalogoPlataforma,
  type PedidoPlataformaInput,
  type RespuestaPedidoPlataforma,
} from '../api/comanda';
import { ApiError } from '../api/client';
import { formatearCOP } from '../utils/formato';

const LLAVE_API_KEY = 'simulador-plataforma:api-key';
const INTERVALO_ACUSES_MS = 2000;

const leerApiKeyGuardada = () => {
  try {
    return localStorage.getItem(LLAVE_API_KEY) ?? '';
  } catch {
    return '';
  }
};

const nuevoOrderId = () => `PLT-${Date.now().toString().slice(-6)}`;

// DECISIÓN DE PROTOTIPO (Fase 12B, CU-05): esta página hace de plataforma de
// domicilios externa. No usa la sesión de Comanda: se identifica con la API
// key de la integración (PLATAFORMA_SIMULADA_API_KEY del .env), lee el
// catálogo, manda pedidos en el formato propio de la plataforma y muestra los
// acuses que el worker le devuelve por webhook. "Reenviar" repite el último
// pedido tal cual para demostrar que no se duplica en cocina.
// Los acuses se consultan cada 2 s: aquí el que espera es la plataforma
// simulada, no una pantalla de Comanda, así que no usa WebSocket.
export function SimuladorPlataformaPage() {
  const [apiKey, setApiKey] = useState(leerApiKeyGuardada);
  const [catalogo, setCatalogo] = useState<CatalogoPlataforma | null>(null);
  const [errorConexion, setErrorConexion] = useState<string | null>(null);

  const [sedeId, setSedeId] = useState('');
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [cliente, setCliente] = useState({ name: 'Cliente de plataforma', phone: '3000000000', address: 'Cl 100 # 10-10' });
  const [enviando, setEnviando] = useState(false);
  const [errorPedido, setErrorPedido] = useState<string | null>(null);
  const [ultimoPedido, setUltimoPedido] = useState<PedidoPlataformaInput | null>(null);
  const [respuestas, setRespuestas] = useState<RespuestaPedidoPlataforma[]>([]);
  const [acuses, setAcuses] = useState<AcusePlataforma[]>([]);

  const conectar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorConexion(null);
    try {
      const datos = await obtenerCatalogoPlataforma(apiKey);
      setCatalogo(datos);
      setSedeId(datos.sedes[0]?.id ?? '');
      try {
        localStorage.setItem(LLAVE_API_KEY, apiKey);
      } catch {
        // Sin almacenamiento solo se pierde la comodidad de no volver a pegarla.
      }
    } catch (err) {
      setCatalogo(null);
      setErrorConexion(err instanceof ApiError ? err.message : 'No se pudo conectar con Comanda');
    }
  };

  useEffect(() => {
    if (!catalogo) return;
    let activo = true;
    const consultar = () =>
      listarAcusesPlataforma(apiKey)
        .then((lista) => activo && setAcuses(lista))
        .catch(() => undefined);
    void consultar();
    const intervalo = setInterval(consultar, INTERVALO_ACUSES_MS);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, [catalogo, apiKey]);

  const cambiarCantidad = (productoId: string, delta: number) =>
    setCantidades((prev) => {
      const cantidad = Math.max(0, (prev[productoId] ?? 0) + delta);
      return { ...prev, [productoId]: cantidad };
    });

  const items = Object.entries(cantidades)
    .filter(([, qty]) => qty > 0)
    .map(([sku, qty]) => ({ sku, qty }));

  const enviar = async (pedido: PedidoPlataformaInput) => {
    setEnviando(true);
    setErrorPedido(null);
    try {
      const respuesta = await enviarPedidoPlataforma(pedido, apiKey);
      setUltimoPedido(pedido);
      setRespuestas((prev) => [respuesta, ...prev].slice(0, 10));
    } catch (err) {
      setErrorPedido(err instanceof ApiError ? err.message : 'No se pudo enviar el pedido');
    } finally {
      setEnviando(false);
    }
  };

  const enviarNuevo = (e: FormEvent) => {
    e.preventDefault();
    if (items.length === 0 || !sedeId) return;
    void enviar({ orderId: nuevoOrderId(), storeId: sedeId, customer: cliente, items });
    setCantidades({});
  };

  return (
    <div className="menu-publico">
      <header className="menu-publico-header">
        <h1>Plataforma de domicilios (simulada)</h1>
        <p>Hace de sistema externo: manda pedidos a Comanda por API con su propio formato.</p>
      </header>

      <form className="login-form" onSubmit={conectar}>
        <label>
          API key de la integración
          <input
            required
            type="password"
            value={apiKey}
            placeholder="PLATAFORMA_SIMULADA_API_KEY del .env"
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        {errorConexion && <p className="login-error">{errorConexion}</p>}
        <button type="submit">{catalogo ? 'Reconectar' : 'Conectar'}</button>
      </form>

      {catalogo && (
        <>
          <section className="menu-publico-domicilio">
            <h2>Nuevo pedido</h2>
            <form className="login-form" onSubmit={enviarNuevo}>
              <label>
                Sede de destino
                <select value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
                  {catalogo.sedes.map((sede) => (
                    <option key={sede.id} value={sede.id}>
                      {sede.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <ul className="lista-items">
                {catalogo.productos.map((producto) => (
                  <li key={producto.id} className="menu-publico-item">
                    <span>
                      {producto.nombre}
                      <br />
                      <small>{formatearCOP(producto.precio)}</small>
                    </span>
                    <span className="carrito-item-acciones">
                      {(cantidades[producto.id] ?? 0) > 0 && (
                        <>
                          <button type="button" onClick={() => cambiarCantidad(producto.id, -1)}>
                            −
                          </button>
                          <span>{cantidades[producto.id]}</span>
                        </>
                      )}
                      <button type="button" onClick={() => cambiarCantidad(producto.id, 1)}>
                        +
                      </button>
                    </span>
                  </li>
                ))}
              </ul>

              <label>
                Cliente
                <input
                  required
                  maxLength={120}
                  value={cliente.name}
                  onChange={(e) => setCliente({ ...cliente, name: e.target.value })}
                />
              </label>
              <label>
                Teléfono
                <input
                  required
                  maxLength={30}
                  value={cliente.phone}
                  onChange={(e) => setCliente({ ...cliente, phone: e.target.value })}
                />
              </label>
              <label>
                Dirección
                <input
                  required
                  maxLength={200}
                  value={cliente.address}
                  onChange={(e) => setCliente({ ...cliente, address: e.target.value })}
                />
              </label>

              {errorPedido && <p className="login-error">{errorPedido}</p>}
              <button type="submit" disabled={enviando || items.length === 0}>
                {enviando ? 'Enviando…' : 'Enviar pedido nuevo'}
              </button>
              {ultimoPedido && (
                <button type="button" disabled={enviando} onClick={() => void enviar(ultimoPedido)}>
                  Reenviar {ultimoPedido.orderId} (no debe duplicarse)
                </button>
              )}
            </form>
          </section>

          <section className="menu-publico-categoria">
            <h2>Respuestas de Comanda</h2>
            {respuestas.length === 0 && <p className="panel-nota">Todavía no se ha enviado nada.</p>}
            <ul className="lista-items">
              {respuestas.map((r, i) => (
                <li key={`${r.externalId}-${i}`}>
                  {r.orderId} → {r.status} · {formatearCOP(r.total)} {r.duplicate ? '(duplicado, no se creó otro)' : '(nuevo)'}
                </li>
              ))}
            </ul>
          </section>

          <section className="menu-publico-categoria">
            <h2>Acuses recibidos (webhook)</h2>
            {acuses.length === 0 && <p className="panel-nota">El worker todavía no ha entregado ningún acuse.</p>}
            <ul className="lista-items">
              {acuses.map((acuse, i) => (
                <li key={`${acuse.recibidoEn}-${i}`}>
                  {new Date(acuse.recibidoEn).toLocaleTimeString('es-CO')} · {acuse.cuerpo.orderId} {acuse.cuerpo.status} en{' '}
                  {acuse.cuerpo.store}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
