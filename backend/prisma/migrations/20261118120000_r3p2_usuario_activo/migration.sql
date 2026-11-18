-- Gestión de usuarios (/usuarios): baja lógica del usuario. Los existentes
-- quedan activos. La política RLS de `usuarios` (por cadena_id, r2p1_rls) no
-- cambia.

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;
