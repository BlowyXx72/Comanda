import sharp from 'sharp';
import { TAMANOS_IMAGEN, type TamanoImagen } from './imagen-publica.js';

// DECISIÓN DE PROTOTIPO (Fase 16B): JPEG, PNG o WebP de hasta 2 MB. El tipo
// se comprueba leyendo el archivo con sharp, no con el Content-Type que manda
// el navegador (se puede falsificar). SVG no se acepta: puede llevar scripts.
export const TAMANO_MAXIMO_BYTES = 2 * 1024 * 1024;
const FORMATOS_ACEPTADOS = new Set(['jpeg', 'png', 'webp']);
// Una imagen de 2 MB muy comprimida puede abrir en miles de megapíxeles
// ("bomba de descompresión"); 40 MP (p. ej. 8000×5000) cubre cualquier foto
// de celular.
const PIXELES_MAXIMOS = 40_000_000;

export class ImagenInvalidaError extends Error {}

// Recorta a 4:3 centrando en lo más llamativo y genera las variantes WebP de
// 800 y 400 px de ancho, para que el menú cargue rápido con datos móviles
// (§4.3: el ancho de banda lo dominan las imágenes del menú). Quita los
// metadatos EXIF (ubicación GPS del celular, etc.).
export async function procesarImagen(entrada: Buffer): Promise<Record<TamanoImagen, Buffer>> {
  let formato: string | undefined;
  try {
    formato = (await sharp(entrada, { limitInputPixels: PIXELES_MAXIMOS }).metadata()).format;
  } catch {
    throw new ImagenInvalidaError('El archivo no es una imagen válida');
  }
  if (!formato || !FORMATOS_ACEPTADOS.has(formato)) {
    throw new ImagenInvalidaError('Formato no permitido: usa JPEG, PNG o WebP');
  }

  const variantes = await Promise.all(
    TAMANOS_IMAGEN.map(async (ancho) => {
      const buffer = await sharp(entrada, { limitInputPixels: PIXELES_MAXIMOS })
        .rotate() // respeta la orientación EXIF antes de quitarla
        .resize(ancho, (ancho * 3) / 4, { fit: 'cover', position: sharp.strategy.attention })
        .webp({ quality: 80 })
        .toBuffer();
      return [ancho, buffer] as const;
    }),
  );
  return Object.fromEntries(variantes) as Record<TamanoImagen, Buffer>;
}
