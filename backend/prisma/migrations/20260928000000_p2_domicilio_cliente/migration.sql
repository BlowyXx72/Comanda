-- AlterEnum
ALTER TYPE "CanalPedido" ADD VALUE 'DOMICILIO';

-- DropForeignKey
ALTER TABLE "pedidos" DROP CONSTRAINT "pedidos_usuario_id_fkey";

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "cliente_id" TEXT,
ALTER COLUMN "usuario_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "cadena_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_cadena_id_fkey" FOREIGN KEY ("cadena_id") REFERENCES "cadenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
