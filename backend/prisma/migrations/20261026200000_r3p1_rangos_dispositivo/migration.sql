-- Fase 16 (§6.3, CU-07): sub-rangos de numeración fiscal reservados por
-- dispositivo (caja) para cobrar sin conexión. Ver RangoDispositivo en
-- schema.prisma.

-- CreateTable
CREATE TABLE "rangos_dispositivo" (
    "id" TEXT NOT NULL,
    "sede_id" TEXT NOT NULL,
    "dispositivo_id" TEXT NOT NULL,
    "inicio" INTEGER NOT NULL,
    "fin" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rangos_dispositivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rangos_dispositivo_sede_id_dispositivo_id_idx" ON "rangos_dispositivo"("sede_id", "dispositivo_id");

-- AddForeignKey
ALTER TABLE "rangos_dispositivo" ADD CONSTRAINT "rangos_dispositivo_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fase 12 (§6.1): misma RLS que el resto de tablas colgadas de una sede
-- (ver r2p1_rls). Los permisos DML de comanda_app llegan solos por el
-- ALTER DEFAULT PRIVILEGES de r2p1_rol_app.
ALTER TABLE "rangos_dispositivo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rangos_dispositivo" FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cadena ON "rangos_dispositivo" FOR ALL TO comanda_app
  USING (EXISTS (SELECT 1 FROM sedes s WHERE s.id = sede_id))
  WITH CHECK (EXISTS (SELECT 1 FROM sedes s WHERE s.id = sede_id));
DO $$
BEGIN
  EXECUTE format(
    'CREATE POLICY dueno_total ON rangos_dispositivo FOR ALL TO %I USING (true) WITH CHECK (true)',
    current_user);
END
$$;
