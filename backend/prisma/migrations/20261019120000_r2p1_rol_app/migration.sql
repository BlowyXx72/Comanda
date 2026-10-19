-- DECISIÓN DE PROTOTIPO (Fase 12, §6.1): rol de Postgres para la aplicación,
-- distinto del dueño del esquema. El dueño (DATABASE_URL, el que corre las
-- migraciones y el seed) ignora Row Level Security salvo que se use FORCE, y un
-- superusuario la ignora siempre; por eso las consultas de negocio van con este
-- rol sin privilegios de dueño (DATABASE_URL_APP), sobre el que las políticas de
-- la migración r2p1_rls sí aplican.
--
-- Por qué una migración SQL y no un script de init de Postgres: los scripts de
-- /docker-entrypoint-initdb.d solo corren con el volumen de datos vacío, y aquí
-- ya hay bases creadas; una migración se aplica igual a bases nuevas y viejas.
-- La contraseña NO va aquí (los secretos viven solo en .env): el rol se crea sin
-- contraseña y prisma/configurar-rol-app.ts se la asigna desde DATABASE_URL_APP
-- justo después de `prisma migrate deploy`.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comanda_app') THEN
    CREATE ROLE comanda_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

-- Solo DML sobre las tablas de negocio: sin DDL, sin CREATE en el esquema.
GRANT USAGE ON SCHEMA public TO comanda_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO comanda_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO comanda_app;

-- Las tablas que creen migraciones futuras (las crea el dueño) quedan con los
-- mismos permisos DML sin tener que repetir el GRANT.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO comanda_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO comanda_app;

-- _prisma_migrations es de uso exclusivo del dueño.
REVOKE ALL ON TABLE "_prisma_migrations" FROM comanda_app;
