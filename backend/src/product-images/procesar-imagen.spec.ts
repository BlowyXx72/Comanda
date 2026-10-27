import sharp from 'sharp';
import { conImagenPublica, urlPublicaImagen } from './imagen-publica.js';
import { ImagenInvalidaError, procesarImagen } from './procesar-imagen.js';

// Fase 16B: validación y procesamiento de la foto de producto.
describe('procesarImagen', () => {
  const foto = (formato: 'jpeg' | 'png' | 'webp', ancho = 1200, alto = 900) =>
    sharp({ create: { width: ancho, height: alto, channels: 3, background: '#ffa69e' } })
      .toFormat(formato)
      .toBuffer();

  it.each(['jpeg', 'png', 'webp'] as const)('acepta %s y genera WebP 4:3 de 800 y 400 px', async (formato) => {
    const variantes = await procesarImagen(await foto(formato, 3000, 1000));

    for (const [ancho, alto] of [
      [800, 600],
      [400, 300],
    ] as const) {
      const meta = await sharp(variantes[ancho]).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['webp', ancho, alto]);
    }
  });

  it('quita los metadatos EXIF (p. ej. la ubicación del celular)', async () => {
    const conExif = await sharp(await foto('jpeg'))
      .withMetadata({ exif: { IFD0: { Artist: 'prueba' } } })
      .toBuffer();
    expect((await sharp(conExif).metadata()).exif).toBeDefined();

    const variantes = await procesarImagen(conExif);
    expect((await sharp(variantes[800]).metadata()).exif).toBeUndefined();
  });

  it('rechaza lo que no es imagen aunque diga serlo', async () => {
    await expect(procesarImagen(Buffer.from('no soy una foto'))).rejects.toBeInstanceOf(ImagenInvalidaError);
  });

  it('rechaza SVG (puede llevar scripts) y otros formatos', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    await expect(procesarImagen(svg)).rejects.toThrow('Formato no permitido');
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer();
    await expect(procesarImagen(gif)).rejects.toThrow('Formato no permitido');
  });
});

describe('URL pública de la foto', () => {
  const uri = 's3://comanda-imagenes/productos/c1/p1-abc';

  it('arma la URL de cada variante sin exponer el bucket', () => {
    expect(urlPublicaImagen(uri, 800)).toBe('/api/menu/imagenes/productos/c1/p1-abc-800.webp');
    expect(urlPublicaImagen(uri, 400)).toBe('/api/menu/imagenes/productos/c1/p1-abc-400.webp');
    expect(urlPublicaImagen(null)).toBeNull();
  });

  it('conImagenPublica reemplaza la URI interna por las URL públicas', () => {
    const producto = conImagenPublica({ id: 'p1', imagenUrl: uri });
    expect(producto.imagenUrl).not.toContain('s3://');
    expect(producto.imagenMiniaturaUrl).toContain('-400.webp');
  });
});
