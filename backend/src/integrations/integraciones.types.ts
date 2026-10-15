export const COLA_ACUSES = 'plataformas';

// Payload de cada trabajo de la cola de acuses. Igual que en la cola fiscal,
// lleva `cadenaId` porque el worker no tiene JWT (contrato 2 de
// docs/fases-siguientes-2.md).
export interface TrabajoAcuse {
  pedidoId: string;
  cadenaId: string;
  integracionId: string;
}

// La integración autenticada por X-Api-Key que el guard deja en la petición.
export interface IntegracionAutenticada {
  id: string;
  cadenaId: string;
  nombre: string;
}
