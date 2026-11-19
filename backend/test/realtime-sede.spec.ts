import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { RealtimeGateway } from '../src/realtime/realtime.gateway.js';

// Tiempo real por sede (Fases 4 y 17). La pantalla pide `sede:unirse` apenas
// recibe `connect`, como hace useComandaSocket. Regresión: con la identidad
// resuelta dentro de handleConnection (async, con una consulta a la base),
// ese `sede:unirse` llegaba a veces antes de conocer la cadena y se rechazaba
// como "sede ajena", así que la pantalla no recibía comandas en vivo.
// De integración contra la base real y un servidor HTTP propio, con una
// cadena de prueba que se borra al final.
// Correr con: docker compose exec backend-1 npx vitest run test/realtime-sede.spec.ts
const sufijo = Date.now().toString(36);
const duenio = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

let app: INestApplication;
let gateway: RealtimeGateway;
let url = '';
const c = {
  cadena: '',
  sedeA: '',
  sedeB: '',
  admin: `admin-rt-${sufijo}@test.local`,
  mesero: `mesero-rt-${sufijo}@test.local`,
};
const tokens: Record<string, string> = {};
const abiertos: Socket[] = [];

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function conectar(token: string) {
  const socket = io(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  abiertos.push(socket);
  return socket;
}

function primerEvento<T>(socket: Socket, evento: string, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const reloj = setTimeout(() => reject(new Error(`no llegó ${evento} en ${ms} ms`)), ms);
    socket.once(evento, (dato: T) => {
      clearTimeout(reloj);
      resolve(dato);
    });
  });
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash('clave123', 4);
  c.cadena = (await duenio.cadena.create({ data: { nit: `rt-${sufijo}`, nombre: `rt-${sufijo}`, plan: 'BASICO' } })).id;
  for (const [llave, nombre] of [['sedeA', 'A'], ['sedeB', 'B']] as const) {
    c[llave] = (
      await duenio.sede.create({
        data: { cadenaId: c.cadena, nombre, direccion: 'x', rangoInicio: 1, rangoFin: 10, siguienteConsecutivo: 1 },
      })
    ).id;
  }
  await duenio.usuario.create({ data: { cadenaId: c.cadena, rol: 'ADMIN', email: c.admin, passwordHash } });
  await duenio.usuario.create({
    data: { cadenaId: c.cadena, rol: 'MESERO', email: c.mesero, passwordHash, sedeId: c.sedeA },
  });

  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0);
  const { port } = app.getHttpServer().address() as AddressInfo;
  url = `http://127.0.0.1:${port}`;
  gateway = app.get(RealtimeGateway);

  for (const email of [c.admin, c.mesero]) {
    const r = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'clave123' }).expect(200);
    tokens[email] = r.body.accessToken;
  }
});

afterAll(async () => {
  for (const socket of abiertos) socket.disconnect();
  await app?.close();
  await duenio.usuario.deleteMany({ where: { cadenaId: c.cadena } });
  await duenio.sede.deleteMany({ where: { cadenaId: c.cadena } });
  await duenio.cadena.deleteMany({ where: { id: c.cadena } });
  await duenio.$disconnect();
});

describe('tiempo real por sede', () => {
  it('quien pide sede:unirse apenas conecta queda en la sala y recibe las comandas (10 conexiones seguidas)', async () => {
    for (let i = 0; i < 10; i++) {
      const socket = conectar(tokens[c.admin]);
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => {
          socket.emit('sede:unirse', { sedeId: c.sedeA });
          resolve();
        });
        socket.on('connect_error', reject);
      });
      // Margen para que el servidor termine de procesar la unión.
      await esperar(200);
      const llegada = primerEvento<{ id: string }>(socket, 'comanda:nueva', 2000);
      gateway.emitirComandaNueva(c.sedeA, { id: `pedido-${i}` });
      expect(await llegada).toEqual({ id: `pedido-${i}` });
      socket.disconnect();
    }
  });

  it('el acuse dice si quedó en la sala: un mesero con sede asignada no entra a otra sede', async () => {
    const socket = conectar(tokens[c.mesero]);
    await primerEvento(socket, 'connect', 2000);
    expect(await socket.emitWithAck('sede:unirse', { sedeId: c.sedeB })).toEqual({ ok: false });
    expect(await socket.emitWithAck('sede:unirse', { sedeId: crypto.randomUUID() })).toEqual({ ok: false });
    expect(await socket.emitWithAck('sede:unirse', { sedeId: c.sedeA })).toEqual({ ok: true });

    const deOtraSede = primerEvento(socket, 'comanda:nueva', 500);
    gateway.emitirComandaNueva(c.sedeB, { id: 'de-la-sede-b' });
    await expect(deOtraSede).rejects.toThrow('no llegó');
  });

  it('sin token o con un token inválido, el handshake se rechaza antes de conectar', async () => {
    for (const auth of [{}, { token: 'no-es-un-jwt' }]) {
      const socket = io(url, { auth, transports: ['websocket'], reconnection: false, forceNew: true });
      abiertos.push(socket);
      const error = await primerEvento<Error>(socket, 'connect_error', 2000);
      expect(error.message).toBe('No autorizado');
      expect(socket.connected).toBe(false);
    }
  });
});
