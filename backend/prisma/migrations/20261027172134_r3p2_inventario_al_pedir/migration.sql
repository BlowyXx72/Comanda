-- AlterTable
ALTER TABLE "movimientos_inventario" ADD COLUMN     "pedido_id" TEXT;

-- CreateIndex
CREATE INDEX "movimientos_inventario_pedido_id_idx" ON "movimientos_inventario"("pedido_id");

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

