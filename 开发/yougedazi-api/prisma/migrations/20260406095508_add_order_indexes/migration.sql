-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_companion_id_created_at_idx" ON "orders"("companion_id", "created_at");
