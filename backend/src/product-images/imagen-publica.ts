// Fase 16B: convierte la URI interna de la foto (s3://bucket/llave-base) en
// la URL pública que recibe el navegador. Nadie arma la URL en el frontend
// (contrato 2 de docs/fases-siguientes-3.md).
// - Local: /api/menu/imagenes/... (proxy al almacén, ImagenesPublicasController).
// - AWS: la URL de CloudFront sobre el bucket de imágenes.
// DECISIÓN DE PROTOTIPO: el valor por defecto es una ruta relativa al mismo
// origen, porque la app se abre por https://localhost:8443, por
// http://localhost:5173 o por la IP de la red local, y todas sirven /api.
const BASE = (process.env.URL_PUBLICA_IMAGENES || '/api/menu/imagenes').replace(/\/$/, '');

// Variantes que genera procesarImagen(): ancho en px, en proporción 4:3.
export const TAMANOS_IMAGEN = [800, 400] as const;
export type TamanoImagen = (typeof TAMANOS_IMAGEN)[number];

const PREFIJO_URI = 's3://';

// s3://bucket/productos/c/p-v -> productos/c/p-v
export const llaveBase = (uri: string) => {
  const sinPrefijo = uri.slice(PREFIJO_URI.length);
  return sinPrefijo.slice(sinPrefijo.indexOf('/') + 1);
};

export const llaveVariante = (base: string, tamano: TamanoImagen) => `${base}-${tamano}.webp`;

export function urlPublicaImagen(uri: string | null | undefined, tamano: TamanoImagen = 800): string | null {
  return uri ? `${BASE}/${llaveVariante(llaveBase(uri), tamano)}` : null;
}

// Lo que devuelven GET /productos, el menú QR y la subida: la URI interna
// nunca sale del backend.
export function conImagenPublica<T extends { imagenUrl: string | null }>(producto: T) {
  return {
    ...producto,
    imagenUrl: urlPublicaImagen(producto.imagenUrl, 800),
    imagenMiniaturaUrl: urlPublicaImagen(producto.imagenUrl, 400),
  };
}
