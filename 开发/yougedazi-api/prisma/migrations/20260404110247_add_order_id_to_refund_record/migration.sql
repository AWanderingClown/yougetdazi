/*
  Warnings:

  - Added the required column `order_id` to the `refund_records` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "refund_records" ADD COLUMN     "order_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "refund_records_order_id_idx" ON "refund_records"("order_id");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
