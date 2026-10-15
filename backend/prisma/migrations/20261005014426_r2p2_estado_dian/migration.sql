-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoDian" ADD VALUE 'PENDIENTE';
ALTER TYPE "EstadoDian" ADD VALUE 'VALIDADO_SIMULADO';
ALTER TYPE "EstadoDian" ADD VALUE 'RECHAZADO_SIMULADO';

-- AlterTable
ALTER TABLE "documentos_fiscales" ADD COLUMN     "mensaje_dian" TEXT,
ADD COLUMN     "validado_en" TIMESTAMP(3);
