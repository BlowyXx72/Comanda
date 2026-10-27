// Fase 20B (§5.2, DNS multi-tenant): cada cadena tiene su subdominio, p. ej.
// lacadena.comandacentral.co. URL_PUBLICA_CADENA es la plantilla de esa URL:
//   beta:  https://{subdominio}.comanda.ejemplo.co
//   local: https://{subdominio}.localhost:8443   (*.localhost resuelve a 127.0.0.1)
// Vacía = sin subdominios: todo entra por el dominio principal, como antes.
// DECISIÓN DE PROTOTIPO: una sola variable, y de ella sale también el dominio
// base con el que se reconoce el Host de cada petición.
const MARCA = '{subdominio}';

const plantilla = () => (process.env.URL_PUBLICA_CADENA ?? '').trim().replace(/\/$/, '');

const sinPuerto = (host: string) => host.replace(/:\d+$/, '').toLowerCase();

// "{subdominio}.comanda.ejemplo.co" -> "comanda.ejemplo.co"
function dominioBase(): string | null {
  const url = plantilla();
  if (!url.includes(MARCA)) return null;
  try {
    const host = new URL(url.replace(MARCA, 'x')).host;
    return sinPuerto(host).replace(/^x\./, '');
  } catch {
    return null;
  }
}

export const subdominiosHabilitados = () => dominioBase() !== null;

// Host de la petición -> subdominio de la cadena, o null si es el dominio
// principal, otro dominio o hay más de una etiqueta delante del base.
export function subdominioDeHost(host: string | undefined): string | null {
  const base = dominioBase();
  if (!base || !host) return null;
  const limpio = sinPuerto(host);
  if (!limpio.endsWith(`.${base}`)) return null;
  const etiqueta = limpio.slice(0, -(base.length + 1));
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(etiqueta) ? etiqueta : null;
}

// subdominio -> https://lacadena.comanda.ejemplo.co (sin barra final)
export function urlPublicaCadena(subdominio: string | null): string | null {
  return subdominio && subdominiosHabilitados() ? plantilla().replace(MARCA, subdominio) : null;
}
