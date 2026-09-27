import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const hash = (plano: string) => bcrypt.hash(plano, 10);

async function main() {
  // Seed idempotente: se limpia todo y se recrea, en orden inverso a las FK.
  await prisma.documentoFiscal.deleteMany();
  await prisma.pago.deleteMany();
  await prisma.pedidoDetalle.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.mesa.deleteMany();
  await prisma.producto.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.sede.deleteMany();
  await prisma.cadena.deleteMany();

  const cadena = await prisma.cadena.create({
    data: { nit: '900123456-7', nombre: 'Demo', plan: 'BASICO' },
  });

  // DECISIÓN DE PROTOTIPO (Fase 7): 3 sedes en vez de 1, para poder demostrar
  // el panel multi-sede (CU-06) y el catálogo centralizado (CU-08).
  // Fase 8: cada sede recibe un rango de numeración fiscal que no se solapa
  // con el de las demás (§6.3 de la propuesta); `siguienteConsecutivo`
  // arranca en `rangoInicio`, así que el primer documento fiscal de cada
  // sede usa exactamente ese número.
  const sedes = await Promise.all(
    [
      { nombre: 'Sede Centro', direccion: 'Cra 10 # 20-30, Bogotá', rangoInicio: 1, rangoFin: 1000 },
      { nombre: 'Sede Norte', direccion: 'Cl 140 # 15-20, Bogotá', rangoInicio: 1001, rangoFin: 2000 },
      { nombre: 'Sede Chapinero', direccion: 'Cra 13 # 60-10, Bogotá', rangoInicio: 2001, rangoFin: 3000 },
    ].map(({ rangoInicio, ...datos }) =>
      prisma.sede.create({ data: { cadenaId: cadena.id, rangoInicio, siguienteConsecutivo: rangoInicio, ...datos } }),
    ),
  );

  await prisma.usuario.createMany({
    data: [
      {
        cadenaId: cadena.id,
        rol: 'ADMIN',
        email: 'admin@demo.com',
        passwordHash: await hash('admin123'),
      },
      {
        cadenaId: cadena.id,
        rol: 'CAJERO',
        email: 'cajero@demo.com',
        passwordHash: await hash('cajero123'),
      },
      {
        cadenaId: cadena.id,
        rol: 'MESERO',
        email: 'mesero@demo.com',
        passwordHash: await hash('mesero123'),
      },
    ],
  });

  await prisma.producto.createMany({
    data: [
      { cadenaId: cadena.id, nombre: 'Hamburguesa Clásica', precio: 18000, categoria: 'Plato fuerte' },
      { cadenaId: cadena.id, nombre: 'Pizza Personal', precio: 22000, categoria: 'Plato fuerte' },
      { cadenaId: cadena.id, nombre: 'Perro Caliente', precio: 12000, categoria: 'Plato fuerte' },
      { cadenaId: cadena.id, nombre: 'Ensalada César', precio: 15000, categoria: 'Plato fuerte' },
      { cadenaId: cadena.id, nombre: 'Papas Fritas', precio: 8000, categoria: 'Acompañamiento' },
      { cadenaId: cadena.id, nombre: 'Limonada Natural', precio: 6000, categoria: 'Bebida' },
      { cadenaId: cadena.id, nombre: 'Gaseosa', precio: 5000, categoria: 'Bebida' },
      { cadenaId: cadena.id, nombre: 'Brownie con Helado', precio: 9000, categoria: 'Postre' },
    ],
  });

  for (const s of sedes) {
    await prisma.mesa.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        sedeId: s.id,
        numero: i + 1,
        estado: 'LIBRE' as const,
      })),
    });
  }

  console.log(`Seed completado: 1 cadena, ${sedes.length} sedes, 3 usuarios, 8 productos, ${sedes.length * 6} mesas.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
