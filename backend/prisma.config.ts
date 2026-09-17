// DECISIÓN DE PROTOTIPO: en Prisma 7 la URL de conexión para Migrate/CLI ya
// no vive en schema.prisma, sino aquí. El cliente en tiempo de ejecución usa
// su propio driver adapter (ver src/prisma/prisma.service.ts).
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
