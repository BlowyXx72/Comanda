import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import sharp from 'sharp';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { llaveVariante, TAMANOS_IMAGEN } from '../src/product-images/imagen-publica.js';
import { procesarImagen } from '../src/product-images/procesar-imagen.js';
import { AlmacenObjetosService } from '../src/storage/almacen-objetos.service.js';

// Fase 16B: le pone foto a los productos del seed. Va aparte de seed.ts
// (Parte 1) para no tocarlo; correr después del seed:
//   docker compose exec backend-1 npm run seed:imagenes            (solo los que no tienen foto)
//   docker compose exec backend-1 npm run seed:imagenes -- --forzar (reemplaza todas)
// Las ilustraciones son propias (ver prisma/imagenes-demo/LEEME.md). El SVG
// se pasa a PNG aquí y luego sigue el mismo camino que una foto subida desde
// /catalogo (procesarImagen), que no acepta SVG.
// DECISIÓN DE PROTOTIPO: solo para ambientes de prueba, nunca en producción.
const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), 'imagenes-demo');
const forzar = process.argv.includes('--forzar');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const almacen = new AlmacenObjetosService();

// "Hamburguesa Clásica" -> "hamburguesa-clasica"
const slug = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-');

async function main() {
  const disponibles = new Set((await readdir(carpeta)).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)));
  const productos = await prisma.producto.findMany({ select: { id: true, cadenaId: true, nombre: true, imagenUrl: true } });

  let asignadas = 0;
  for (const producto of productos) {
    const nombre = slug(producto.nombre);
    if (!disponibles.has(nombre) || (producto.imagenUrl && !forzar)) continue;

    const png = await sharp(await readFile(path.join(carpeta, `${nombre}.svg`)))
      .png()
      .toBuffer();
    const variantes = await procesarImagen(png);
    const base = `productos/${producto.cadenaId}/${producto.id}-${Date.now().toString(36)}`;
    for (const tamano of TAMANOS_IMAGEN) {
      await almacen.subir(llaveVariante(base, tamano), variantes[tamano], 'image/webp', {
        bucket: almacen.bucketImagenes,
        cacheControl: 'public, max-age=31536000, immutable',
      });
    }
    await prisma.producto.update({
      where: { id: producto.id },
      data: { imagenUrl: `s3://${almacen.bucketImagenes}/${base}` },
    });
    asignadas++;
    console.log(`  ✔ ${producto.nombre}`);
  }
  console.log(`${asignadas} foto(s) asignadas${forzar ? '' : ' (los productos que ya tenían foto se dejaron igual; usa --forzar para reemplazarlas)'}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
