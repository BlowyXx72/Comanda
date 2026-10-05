// Consumido por ProcesadorFiscalService. Arma el XML del documento
// equivalente que se guarda en el almacén de objetos.
// DECISIÓN DE PROTOTIPO: estructura propia y mínima, sin firma. No sigue el
// anexo técnico de la DIAN (UBL 2.1); solo sirve para demostrar el flujo
// cobro → XML → almacén de objetos → validación en segundo plano.
// TODO PRODUCCIÓN: XML UBL 2.1 firmado según la Resolución 000165 de 2023.

interface DatosXml {
  id: string;
  consecutivo: number;
  tipo: string;
  creadoEn: Date;
  sede: { id: string; nombre: string };
  pedido: {
    id: string;
    total: { toString(): string };
    detalles: { cantidad: number; precioUnitario: { toString(): string }; producto: { nombre: string } }[];
  };
}

const escapar = (texto: string) =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function generarXmlSimulado(doc: DatosXml): string {
  const lineas = doc.pedido.detalles
    .map(
      (d) =>
        `    <linea cantidad="${d.cantidad}" precioUnitario="${d.precioUnitario.toString()}">${escapar(d.producto.nombre)}</linea>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Documento SIMULADO de Comanda Central: no tiene validez fiscal. -->
<documentoEquivalente id="${doc.id}" tipo="${doc.tipo}" consecutivo="${doc.consecutivo}" fecha="${doc.creadoEn.toISOString()}">
  <sede id="${doc.sede.id}">${escapar(doc.sede.nombre)}</sede>
  <pedido id="${doc.pedido.id}" total="${doc.pedido.total.toString()}">
${lineas}
  </pedido>
</documentoEquivalente>
`;
}
