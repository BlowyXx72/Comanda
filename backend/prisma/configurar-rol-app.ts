// DECISIÓN DE PROTOTIPO (Fase 12): asigna al rol `comanda_app` (creado sin
// contraseña por la migración r2p1_rol_app) la contraseña de DATABASE_URL_APP.
// Así el secreto vive solo en .env y no en el SQL versionado. Se corre con el
// rol dueño (DATABASE_URL) justo después de `prisma migrate deploy`, en el
// paso único de despliegue `npm run migrar` (Fase 18: servicio `migrar` de
// docker-compose). Es idempotente y, por el advisory lock, seguro aunque se
// corra dos veces a la vez.
import pg from 'pg';

async function main() {
  const urlDueno = process.env.DATABASE_URL;
  const urlApp = process.env.DATABASE_URL_APP;
  if (!urlDueno || !urlApp) {
    throw new Error('Faltan DATABASE_URL o DATABASE_URL_APP en el entorno');
  }
  const app = new URL(urlApp);
  const rol = decodeURIComponent(app.username);
  const clave = decodeURIComponent(app.password);

  const client = new pg.Client({ connectionString: urlDueno });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [
      'comanda_configurar_rol_app',
    ]);
    const { rows } = await client.query<{ sql: string }>(
      "SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text) AS sql",
      [rol, clave],
    );
    await client.query(rows[0].sql);
    console.log(`Rol ${rol}: contraseña configurada desde DATABASE_URL_APP`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
