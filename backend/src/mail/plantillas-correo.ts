import type { Correo } from './envio-correo.service.js';

// Contenido de los correos de la Fase 14B, en texto plano y HTML mínimo.
// Consumido por: ProcesadorCorreoService.

const cop = (valor: { toString(): string }) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    Number(valor.toString()),
  );

const escapar = (texto: string) =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const AVISO_SIMULADO = 'Documento SIMULADO de un prototipo académico: no tiene validez fiscal.';

export interface DatosComprobante {
  para: string;
  clienteNombre: string;
  sedeNombre: string;
  consecutivo: number;
  fecha: Date;
  total: { toString(): string };
  mensajeDian: string | null;
  lineas: { nombre: string; cantidad: number; precioUnitario: { toString(): string } }[];
}

export function correoComprobante(d: DatosComprobante): Correo {
  const fecha = d.fecha.toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  const lineasTexto = d.lineas.map((l) => `  ${l.cantidad} x ${l.nombre} (${cop(l.precioUnitario)})`).join('\n');
  const lineasHtml = d.lineas
    .map(
      (l) =>
        `<tr><td>${l.cantidad}</td><td>${escapar(l.nombre)}</td><td style="text-align:right">${cop(l.precioUnitario)}</td></tr>`,
    )
    .join('');

  return {
    para: d.para,
    asunto: `Tu comprobante de ${d.sedeNombre} (N.º ${d.consecutivo})`,
    texto: `Hola ${d.clienteNombre}:

Gracias por tu pedido a domicilio en ${d.sedeNombre}.

Comprobante N.º ${d.consecutivo} — ${fecha}
${lineasTexto}
Total: ${cop(d.total)}

Validación: ${d.mensajeDian ?? 'validado'}
${AVISO_SIMULADO}
`,
    html: `<p>Hola ${escapar(d.clienteNombre)}:</p>
<p>Gracias por tu pedido a domicilio en <strong>${escapar(d.sedeNombre)}</strong>.</p>
<p><strong>Comprobante N.º ${d.consecutivo}</strong> — ${fecha}</p>
<table cellpadding="4">${lineasHtml}</table>
<p><strong>Total: ${cop(d.total)}</strong></p>
<p style="color:#666">Validación: ${escapar(d.mensajeDian ?? 'validado')}<br>${AVISO_SIMULADO}</p>`,
  };
}

export interface DatosResumen {
  para: string[];
  cadenaNombre: string;
  fecha: string;
  filas: { sedeNombre: string; canal: string; cantidadPedidos: number; totalVentas: { toString(): string } }[];
  totalGeneral: { toString(): string };
}

export function correoResumenDiario(d: DatosResumen): Correo {
  const sinVentas = d.filas.length === 0;
  const filasTexto = d.filas
    .map((f) => `  ${f.sedeNombre} · ${f.canal}: ${f.cantidadPedidos} pedido(s), ${cop(f.totalVentas)}`)
    .join('\n');
  const filasHtml = d.filas
    .map(
      (f) =>
        `<tr><td>${escapar(f.sedeNombre)}</td><td>${escapar(f.canal)}</td><td style="text-align:right">${f.cantidadPedidos}</td><td style="text-align:right">${cop(f.totalVentas)}</td></tr>`,
    )
    .join('');

  return {
    para: d.para,
    asunto: `Resumen de ventas de ${d.cadenaNombre} — ${d.fecha}`,
    texto: `Resumen de ventas del ${d.fecha} (${d.cadenaNombre})

${sinVentas ? '  Sin ventas registradas.' : filasTexto}
Total del día: ${cop(d.totalGeneral)}
`,
    html: `<p>Resumen de ventas del <strong>${d.fecha}</strong> (${escapar(d.cadenaNombre)})</p>
${
  sinVentas
    ? '<p>Sin ventas registradas.</p>'
    : `<table cellpadding="4"><tr><th>Sede</th><th>Canal</th><th>Pedidos</th><th>Ventas</th></tr>${filasHtml}</table>`
}
<p><strong>Total del día: ${cop(d.totalGeneral)}</strong></p>`,
  };
}
