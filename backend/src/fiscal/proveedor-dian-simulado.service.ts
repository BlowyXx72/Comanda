import { Injectable } from '@nestjs/common';

export class ProveedorDianNoDisponibleError extends Error {
  constructor() {
    super('Proveedor DIAN (simulado) no disponible');
    this.name = 'ProveedorDianNoDisponibleError';
  }
}

export interface RespuestaDian {
  aceptado: boolean;
  mensaje: string;
}

const numero = (valor: string | undefined, porDefecto: number) =>
  valor === undefined || valor === '' ? porDefecto : Number(valor);

// DECISIÓN DE PROTOTIPO: simulador local del proveedor tecnológico DIAN.
// Responde tras una latencia configurable y, con probabilidades
// configurables, rechaza el documento (respuesta de negocio, no se reintenta)
// o "se cae" (error técnico, BullMQ reintenta con backoff). Sirve para
// demostrar que la caja nunca espera a un servicio externo (§5.1, §6.3).
// TODO PRODUCCIÓN: proveedor tecnológico autorizado real (REST/SOAP sobre
// HTTPS, §5.2), firma digital y CUDE/CUFE. Prohibido conectar la DIAN real
// en este prototipo (CLAUDE.md, reglas duras).
@Injectable()
export class ProveedorDianSimuladoService {
  private readonly latenciaMs = numero(process.env.DIAN_SIMULADA_LATENCIA_MS, 2000);
  private readonly tasaFalla = numero(process.env.DIAN_SIMULADA_TASA_FALLA, 0.2);
  private readonly tasaRechazo = numero(process.env.DIAN_SIMULADA_TASA_RECHAZO, 0.1);

  async validar(xml: string): Promise<RespuestaDian> {
    await new Promise((resolve) => setTimeout(resolve, this.latenciaMs));

    if (Math.random() < this.tasaFalla) {
      throw new ProveedorDianNoDisponibleError();
    }
    if (Math.random() < this.tasaRechazo) {
      return { aceptado: false, mensaje: 'Rechazo simulado: el proveedor devolvió un error de validación de prueba' };
    }
    return { aceptado: true, mensaje: `Validación simulada OK (${xml.length} bytes recibidos)` };
  }
}
