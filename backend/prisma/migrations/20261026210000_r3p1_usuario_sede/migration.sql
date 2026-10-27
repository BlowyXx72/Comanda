-- Fase 17: sede asignada al usuario (opcional; null = todas las de la
-- cadena). La política RLS de `usuarios` (por cadena_id, r2p1_rls) no cambia.

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "sede_id" TEXT;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
