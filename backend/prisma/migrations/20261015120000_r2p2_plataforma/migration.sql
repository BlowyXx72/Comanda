-- AlterEnum
ALTER TYPE "CanalPedido" ADD VALUE 'PLATAFORMA';

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "integracion_id" TEXT,
ADD COLUMN     "referencia_externa" TEXT;

-- CreateTable
CREATE TABLE "integraciones_plataforma" (
    "id" TEXT NOT NULL,
    "cadena_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "api_key_hash" TEXT NOT NULL,
    "url_acuse" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "integraciones_plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integraciones_plataforma_api_key_hash_key" ON "integraciones_plataforma"("api_key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_integracion_id_referencia_externa_key" ON "pedidos"("integracion_id", "referencia_externa");

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_integracion_id_fkey" FOREIGN KEY ("integracion_id") REFERENCES "integraciones_plataforma"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integraciones_plataforma" ADD CONSTRAINT "integraciones_plataforma_cadena_id_fkey" FOREIGN KEY ("cadena_id") REFERENCES "cadenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

