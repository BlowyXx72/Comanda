// Prueba de integración de punta a punta (Fase 15; contrato 5 de
// docs/fases-siguientes-2.md). Todo entra por Nginx, como un navegador:
// pedido en mesa → cocina → cobro → XML fiscal; pedido de plataforma y su
// reenvío; domicilio con correo; resumen diario; panel; límite de tasa.
//
// Local (desde la raíz del repo, con el stack arriba y el seed corrido):
//   docker compose exec -e NODE_TLS_REJECT_UNAUTHORIZED=0 backend-1 node scripts/prueba-integracion.mjs
// Contra otro ambiente (Fase 19, AWS):
//   URL_BASE=https://comanda.ejemplo.co MAILPIT_URL= node scripts/prueba-integracion.mjs
//
// DECISIÓN DE PROTOTIPO: script propio sin dependencias (fetch de Node 22)
// en vez de una herramienta E2E, para poder correrlo igual en local y en la nube.
import { randomUUID } from 'node:crypto';

const URL_BASE = (process.env.URL_BASE ?? 'https://nginx').replace(/\/$/, '');
const API = `${URL_BASE}/api`;
// Vacío = no hay Mailpit (p. ej. en AWS con SES): se omiten las verificaciones de correo.
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://mailpit:8025';
const API_KEY = process.env.PLATAFORMA_SIMULADA_API_KEY;
const ESPERA_MAX_MS = Number(process.env.ESPERA_MAX_MS ?? 60_000);

let fallas = 0;
const ok = (msg) => console.log(`  ✔ ${msg}`);
const falla = (msg) => {
  fallas++;
  console.log(`  ✘ ${msg}`);
};
const verificar = (condicion, msg) => (condicion ? ok(msg) : falla(msg));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(metodo, ruta, { token, cuerpo, headers = {} } = {}) {
  const res = await fetch(ruta.startsWith('http') ? ruta : `${API}${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await res.text();
  let datos = texto;
  try {
    datos = JSON.parse(texto);
  } catch {
    // respuesta no JSON (XML, HTML): se deja como texto
  }
  return { status: res.status, datos, headers: res.headers };
}

async function esperar(descripcion, fn) {
  const limite = Date.now() + ESPERA_MAX_MS;
  while (Date.now() < limite) {
    const valor = await fn();
    if (valor) return valor;
    await pausa(1500);
  }
  falla(`${descripcion}: no ocurrió en ${ESPERA_MAX_MS / 1000} s`);
  return null;
}

const login = async (email, password) => {
  const r = await http('POST', '/auth/login', { cuerpo: { email, password } });
  if (r.status !== 200 && r.status !== 201) throw new Error(`Login de ${email} falló (${r.status})`);
  return r.datos;
};

async function main() {
  console.log(`Prueba de integración contra ${URL_BASE}\n`);

  console.log('0. Acceso');
  const admin = await login('admin@demo.com', 'admin123');
  const cajero = await login('cajero@demo.com', 'cajero123');
  const mesero = await login('mesero@demo.com', 'mesero123');
  const cadenaId = admin.usuario.cadenaId;
  ok('login de admin, cajero y mesero');
  const salud = await http('GET', '/health');
  verificar(salud.status === 200, `/health responde 200 (${JSON.stringify(salud.datos)})`);

  const sedes = (await http('GET', '/sedes', { token: admin.accessToken })).datos;
  const [sede1, sede2 = sedes[0]] = sedes;
  const productos = (await http('GET', '/productos', { token: admin.accessToken })).datos.filter((p) => p.activo !== false);
  const producto = productos[0];
  verificar(sedes.length > 0 && productos.length > 0, `${sedes.length} sede(s) y ${productos.length} producto(s) activos`);

  console.log('\n1. Pedido en mesa → cocina → cobro → documento fiscal (11B)');
  const mesas = (await http('GET', `/sedes/${sede1.id}/mesas`, { token: mesero.accessToken })).datos;
  const mesa = mesas.find((m) => m.estado === 'LIBRE');
  if (!mesa) {
    falla(`no hay mesas libres en ${sede1.nombre}; cobra o libera alguna y repite`);
  } else {
    const existencias = async () =>
      Object.fromEntries(
        (await http('GET', `/sedes/${sede1.id}/inventario`, { token: admin.accessToken })).datos.map((i) => [i.id, Number(i.existencia)]),
      );
    const receta = (await http('GET', `/productos/${producto.id}/receta`, { token: admin.accessToken })).datos;
    const antes = await existencias();

    const pedidoId = randomUUID();
    const cuerpoPedido = { id: pedidoId, sedeId: sede1.id, mesaId: mesa.id, detalles: [{ productoId: producto.id, cantidad: 2 }] };
    const creado = await http('POST', '/pedidos', { token: mesero.accessToken, cuerpo: cuerpoPedido });
    verificar(creado.status === 201 && creado.datos.estado === 'EN_PREPARACION', `pedido creado en mesa ${mesa.numero} (EN_PREPARACION)`);
    const repetido = await http('POST', '/pedidos', { token: mesero.accessToken, cuerpo: cuerpoPedido });
    verificar(repetido.datos?.id === pedidoId, 'reenviar el mismo UUID no duplica el pedido');
    const alPedir = await existencias();
    verificar(
      receta.length > 0 && receta.every((r) => alPedir[r.insumoId] === antes[r.insumoId] - Number(r.cantidad) * 2),
      `al entrar a cocina se descuenta la receta × 2 (${receta.map((r) => `${r.insumo.nombre} −${Number(r.cantidad) * 2}`).join(', ')}), una sola vez`,
    );
    const listo = await http('PATCH', `/pedidos/${pedidoId}/estado`, { token: admin.accessToken, cuerpo: { estado: 'LISTO' } });
    verificar(listo.status === 200 && listo.datos.estado === 'LISTO', 'cocina lo marca LISTO');

    const inicio = Date.now();
    const pago = await http('POST', '/pagos', {
      token: cajero.accessToken,
      cuerpo: { pedidoId, medio: 'EFECTIVO', monto: Number(creado.datos.total) },
    });
    const ms = Date.now() - inicio;
    const doc = pago.datos?.documentoFiscal;
    const alCobrar = await existencias();
    verificar(
      receta.every((r) => alCobrar[r.insumoId] === alPedir[r.insumoId]),
      'al cobrar el inventario no vuelve a bajar',
    );
    verificar(pago.status === 201 && doc?.estadoDian === 'PENDIENTE', `cobro inmediato (${ms} ms), documento N.º ${doc?.consecutivo} PENDIENTE`);
    if (doc) {
      const xml = await esperar('XML del documento en el almacén', async () => {
        const r = await http('GET', `/documentos-fiscales/${doc.id}/xml`, { token: cajero.accessToken });
        return r.status === 200 ? r.datos : null;
      });
      if (xml) verificar(String(xml).includes(`consecutivo="${doc.consecutivo}"`), 'el worker generó el XML y se descarga desde el almacén');
    }
  }

  console.log('\n2. Pedido de plataforma por API (12B)');
  if (!API_KEY) {
    falla('falta PLATAFORMA_SIMULADA_API_KEY en el entorno');
  } else {
    const sinLlave = await http('POST', '/integraciones/plataformas/pedidos', { cuerpo: {} });
    verificar(sinLlave.status === 401, 'sin X-Api-Key responde 401');
    const pedidoPlataforma = {
      orderId: `PRUEBA-${Date.now()}`,
      storeId: sede2.id,
      customer: { name: 'Cliente plataforma', phone: '3001234567', address: 'Calle 10 # 5-20' },
      items: [{ sku: producto.id, qty: 1 }],
    };
    const headers = { 'X-Api-Key': API_KEY };
    const primero = await http('POST', '/integraciones/plataformas/pedidos', { cuerpo: pedidoPlataforma, headers });
    verificar(primero.status === 201 && primero.datos.duplicate === false, `pedido ${pedidoPlataforma.orderId} recibido en ${sede2.nombre}`);
    const reenvio = await http('POST', '/integraciones/plataformas/pedidos', { cuerpo: pedidoPlataforma, headers });
    verificar(
      reenvio.datos?.duplicate === true && reenvio.datos.externalId === primero.datos.externalId,
      'el reenvío con el mismo orderId no lo duplica',
    );
    const enCocina = await http('GET', `/pedidos?sedeId=${sede2.id}`, { token: admin.accessToken });
    verificar(
      Array.isArray(enCocina.datos) && enCocina.datos.some((p) => p.id === primero.datos.externalId && p.canal === 'PLATAFORMA'),
      'aparece en la cocina de la sede como PLATAFORMA',
    );
  }

  console.log('\n3. Domicilio con correo y resumen diario (8B, 14B)');
  // La DIAN simulada rechaza o "se cae" a propósito (tasas del .env); el
  // comprobante solo sale si queda VALIDADO, así que se intenta hasta 5 veces.
  let correoRecibido = false;
  for (let intento = 1; intento <= 5 && !correoRecibido; intento++) {
    const email = `prueba-${Date.now()}@example.com`;
    const domicilioId = randomUUID();
    const dom = await http('POST', '/public/pedidos/domicilio', {
      cuerpo: {
        id: domicilioId,
        cadenaId,
        sedeId: sede1.id,
        cliente: { nombre: 'Prueba', telefono: '3000000000', direccion: 'Cra 1 # 2-3', email },
        detalles: [{ productoId: producto.id, cantidad: 1 }],
      },
    });
    if (dom.status !== 201) {
      falla(`domicilio no creado (${dom.status}: ${JSON.stringify(dom.datos)})`);
      break;
    }
    await http('PATCH', `/pedidos/${domicilioId}/estado`, { token: admin.accessToken, cuerpo: { estado: 'LISTO' } });
    const cobro = await http('POST', '/pagos', {
      token: cajero.accessToken,
      cuerpo: { pedidoId: domicilioId, medio: 'TARJETA', monto: Number(dom.datos.total) },
    });
    verificar(cobro.status === 201, `domicilio ${intento} creado y cobrado`);
    if (!MAILPIT_URL) {
      console.log('  · sin MAILPIT_URL: no se verifica la bandeja');
      break;
    }
    const limite = Date.now() + ESPERA_MAX_MS;
    while (Date.now() < limite && !correoRecibido) {
      const r = await http('GET', `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
      correoRecibido = (r.datos?.messages_count ?? 0) > 0;
      if (!correoRecibido) await pausa(2000);
    }
    if (!correoRecibido) console.log('  · sin comprobante (la DIAN simulada lo rechazó o sigue reintentando); se repite');
  }
  if (MAILPIT_URL) verificar(correoRecibido, 'el comprobante del domicilio llegó a la bandeja del cliente');

  const resumen = await http('POST', '/correo/resumen-diario', { token: admin.accessToken, cuerpo: {} });
  verificar(resumen.status === 202, 'resumen diario encolado por el ADMIN');
  if (MAILPIT_URL) {
    const llego = await esperar('resumen diario en la bandeja del ADMIN', async () => {
      const r = await http('GET', `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent('to:admin@demo.com subject:"Resumen"')}`);
      return (r.datos?.messages_count ?? 0) > 0;
    });
    if (llego) ok('el resumen diario llegó al ADMIN');
  }

  console.log('\n4. Panel multi-sede (9, 14) desde la réplica');
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const panel = await http('GET', `/reportes/consolidado?desde=${hoy}&hasta=${hoy}`, { token: admin.accessToken });
  verificar(panel.status === 200 && Number(panel.datos?.totalGeneral) > 0, `consolidado de hoy: ${panel.datos?.totalGeneral}`);

  console.log('\n5. Límite de tasa de Nginx en rutas públicas (13B)');
  const respuestas = await Promise.all(
    Array.from({ length: 40 }, () => http('GET', `/menu/${cadenaId}/${sede1.id}`)),
  );
  const limitadas = respuestas.filter((r) => r.status === 429 || r.status === 503).length;
  verificar(limitadas > 0, `${limitadas} de 40 peticiones seguidas al menú recibieron 429`);

  console.log(`\n${fallas === 0 ? 'TODO OK' : `${fallas} verificación(es) fallaron`}`);
  process.exit(fallas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nError inesperado: ${err.message}`);
  process.exit(1);
});
