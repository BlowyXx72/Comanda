import { useCallback, useEffect, useState } from 'react';
import { obtenerMiCadena } from '../api/comanda';

// DECISIÓN DE PROTOTIPO: el QR se genera en el navegador con `qrcode.react`
// (la propuesta pide el QR por mesa, no cómo generarlo). Apunta a la vista
// pública del menú; VITE_PUBLIC_URL permite usar la IP de la red local para
// escanearlo con un teléfono real (ver .env.example).
const PUBLIC_URL = import.meta.env.VITE_PUBLIC_URL || window.location.origin;

// URL del menú de una mesa, para su QR (CU-03). Fase 20B (§5.2): si la cadena
// tiene subdominio, el QR lleva a lacadena.dominio/menu/:sedeId, sin el id de
// la cadena en la ruta; si no (o sin red), a la ruta de siempre en el origen
// actual. La URL del subdominio la arma el backend (GET /cadena).
export function useUrlMenuMesa(token: string | null) {
  const [urlCadena, setUrlCadena] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let vigente = true;
    obtenerMiCadena(token)
      .then((cadena) => vigente && setUrlCadena(cadena.urlPublica))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [token]);

  return useCallback(
    (cadenaId: string, sedeId: string, numeroMesa: number) =>
      urlCadena
        ? `${urlCadena}/menu/${sedeId}?mesa=${numeroMesa}`
        : `${PUBLIC_URL}/menu/${cadenaId}/${sedeId}?mesa=${numeroMesa}`,
    [urlCadena],
  );
}
