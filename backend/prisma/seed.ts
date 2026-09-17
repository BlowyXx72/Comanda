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

  const sede = await prisma.sede.create({
    data: {
      cadenaId: cadena.id,
      nombre: 'Sede Centro',
      direccion: 'Cra 10 # 20-30, Bogotá',
      // DECISIÓN DE PROTOTIPO: formato ilustrativo, no corresponde a un rango de numeración DIAN real.
      rangoNumeracion: 'SETP990000001-SETP990500000',
    },
  });

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

  await prisma.mesa.createMany({
    data: Array.from({ length: 6 }, (_, i) => ({
      sedeId: sede.id,
      numero: i + 1,
      estado: 'LIBRE' as const,
    })),
  });

  console.log('Seed completado: 1 cadena, 1 sede, 3 usuarios, 8 productos, 6 mesas.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
