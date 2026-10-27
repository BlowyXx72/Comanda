import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Fase 20B (§5.2): por el subdominio de una cadena solo se ve y se opera
// esa cadena (menú QR, domicilio, login); por el dominio principal, igual
// que antes. De integración contra la base real y la app completa (como
// rls-aislamiento.spec.ts), con dos cadenas propias que se borran al final.
// Correr con: docker compose run --rm backend-1 npx vitest run test/subdominio-cadena.spec.ts
const sufijo = Date.now().toString(36);
const duenio = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const urlOriginal = process.env.URL_PUBLICA_CADENA;

let app: INestApplication;
const a = { cadena: '', sede: '', producto: '', sub: `prueba-a-${sufijo}`, email: `admin-a-${sufijo}@test.local` };
const b = { cadena: '', sede: '', producto: '', sub: `prueba-b-${sufijo}`, email: `admin-b-${sufijo}@test.local` };
const host = (sub: string) => `${sub}.localhost:8443`;

beforeAll(async () => {
  process.env.URL_PUBLICA_CADENA = 'https://{subdominio}.localhost:8443';
  const passwordHash = await bcrypt.hash('clave123', 4);
  for (const x of [a, b]) {
    x.cadena = (await duenio.cadena.create({ data: { nit: `sub-${x.sub}`, nombre: x.sub, plan: 'BASICO', subdominio: x.sub } })).id;
    x.sede = (
      await duenio.sede.create({
        data: { cadenaId: x.cadena, nombre: 'Sede', direccion: 'x', rangoInicio: 1, rangoFin: 10, siguienteConsecutivo: 1 },
      })
    ).id;
    await duenio.usuario.create({ data: { cadenaId: x.cadena, rol: 'ADMIN', email: x.email, passwordHash } });
    x.producto = (await duenio.producto.create({ data: { cadenaId: x.cadena, nombre: 'P', precio: 1000, categoria: 'C' } })).id;
  }

  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
});

afterAll(async () => {
  await app?.close();
  for (const x of [a, b]) {
    await duenio.pedidoDetalle.deleteMany({ where: { pedido: { sedeId: x.sede } } });
    await duenio.pedido.deleteMany({ where: { sedeId: x.sede } });
    await duenio.cliente.deleteMany({ where: { cadenaId: x.cadena } });
    await duenio.producto.deleteMany({ where: { cadenaId: x.cadena } });
    await duenio.usuario.deleteMany({ where: { cadenaId: x.cadena } });
    await duenio.sede.deleteMany({ where: { cadenaId: x.cadena } });
    await duenio.cadena.deleteMany({ where: { id: x.cadena } });
  }
  await duenio.$disconnect();
  process.env.URL_PUBLICA_CADENA = urlOriginal;
});

describe('subdominio por cadena', () => {
  it('GET /public/cadena devuelve la cadena del subdominio, y 404 en uno desconocido', async () => {
    const r = await request(app.getHttpServer()).get('/public/cadena').set('Host', host(a.sub)).expect(200);
    expect(r.body).toMatchObject({ id: a.cadena, subdominio: a.sub });
    await request(app.getHttpServer()).get('/public/cadena').set('Host', host(`nadie-${sufijo}`)).expect(404);
  });

  it('el menú de otra cadena no se ve por el subdominio de una', async () => {
    await request(app.getHttpServer()).get(`/menu/${a.cadena}/${a.sede}`).set('Host', host(a.sub)).expect(200);
    await request(app.getHttpServer()).get(`/menu/${b.cadena}/${b.sede}`).set('Host', host(a.sub)).expect(404);
    // Por el dominio principal sigue funcionando como antes.
    await request(app.getHttpServer()).get(`/menu/${b.cadena}/${b.sede}`).set('Host', 'localhost:8443').expect(200);
  });

  it('un domicilio para otra cadena se rechaza por el subdominio de una', async () => {
    const pedido = {
      id: crypto.randomUUID(),
      cadenaId: b.cadena,
      sedeId: b.sede,
      cliente: { nombre: 'X', telefono: '1', direccion: 'Y' },
      detalles: [{ productoId: b.producto, cantidad: 1 }],
    };
    await request(app.getHttpServer()).post('/public/pedidos/domicilio').set('Host', host(a.sub)).send(pedido).expect(404);
    // El mismo pedido, por el subdominio de su cadena, sí entra.
    await request(app.getHttpServer()).post('/public/pedidos/domicilio').set('Host', host(b.sub)).send(pedido).expect(201);
  });

  it('por el subdominio de una cadena solo inician sesión sus usuarios', async () => {
    const login = (email: string, h: string) =>
      request(app.getHttpServer()).post('/auth/login').set('Host', h).send({ email, password: 'clave123' });

    expect((await login(a.email, host(a.sub))).status).toBe(200);
    expect((await login(b.email, host(a.sub))).status).toBe(401);
    expect((await login(b.email, 'localhost:8443')).status).toBe(200);
  });

  it('GET /cadena da la URL pública del subdominio para los QR', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Host', 'localhost')
      .send({ email: a.email, password: 'clave123' });
    const r = await request(app.getHttpServer()).get('/cadena').set('Authorization', `Bearer ${body.accessToken}`).expect(200);
    expect(r.body.urlPublica).toBe(`https://${a.sub}.localhost:8443`);
  });
});
