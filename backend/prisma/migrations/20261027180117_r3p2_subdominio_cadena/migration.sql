-- Fase 20B (§5.2): subdominio por cadena, p. ej. lacadena.comandacentral.co.

-- AlterTable
ALTER TABLE "cadenas" ADD COLUMN     "subdominio" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cadenas_subdominio_key" ON "cadenas"("subdominio");

-- Una sola etiqueta DNS válida: minúsculas, dígitos y guiones, sin guion al
-- inicio ni al final, hasta 63 caracteres.
ALTER TABLE "cadenas" ADD CONSTRAINT "cadenas_subdominio_formato"
  CHECK ("subdominio" IS NULL OR "subdominio" ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$');

-- Las cadenas que ya existen reciben uno a partir del nombre ("Demo" -> "demo").
-- Si dos nombres dan el mismo, la segunda lleva un número ("demo-2").
WITH base AS (
  SELECT id,
         NULLIF(trim(BOTH '-' FROM left(regexp_replace(
           lower(translate(nombre, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')),
           '[^a-z0-9]+', '-', 'g'), 50)), '') AS slug
  FROM "cadenas"
),
numerado AS (
  SELECT id, slug, row_number() OVER (PARTITION BY slug ORDER BY id) AS n
  FROM base
  WHERE slug IS NOT NULL
)
UPDATE "cadenas" c
SET "subdominio" = CASE WHEN n.n = 1 THEN n.slug ELSE n.slug || '-' || n.n END
FROM numerado n
WHERE c.id = n.id;
