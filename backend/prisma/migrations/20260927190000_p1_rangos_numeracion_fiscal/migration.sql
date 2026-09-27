-- AlterTable
-- Se agregan las columnas con DEFAULT para no romper filas existentes y
-- luego se quita el default: el rango real de cada sede lo asigna el seed
-- (ver prisma/seed.ts), no un valor por omisión.
ALTER TABLE "sedes"
  DROP COLUMN "rango_numeracion",
  ADD COLUMN "rango_inicio" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "rango_fin" INTEGER NOT NULL DEFAULT 999999999,
  ADD COLUMN "siguiente_consecutivo" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "sedes" ALTER COLUMN "rango_inicio" DROP DEFAULT;
ALTER TABLE "sedes" ALTER COLUMN "rango_fin" DROP DEFAULT;
ALTER TABLE "sedes" ALTER COLUMN "siguiente_consecutivo" DROP DEFAULT;
