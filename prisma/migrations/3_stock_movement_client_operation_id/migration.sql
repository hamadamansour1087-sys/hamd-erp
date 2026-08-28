-- Crash-safe idempotency for stock adjustments (matches Invoice/Voucher/
-- Transfer/Expense): the scoped idempotency key is stored ON the movement
-- itself, inside the same transaction that writes StockLevel. A retry after
-- a post-COMMIT crash resolves to the committed movement via the unique
-- index below — a duplicate StockMovement / second StockLevel change is
-- impossible in every interleaving.

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN "clientOperationId" TEXT;

-- CreateIndex
-- Unique per tenant; SQLite treats NULLs as distinct, so the many NULL rows
-- (sales/purchases/transfers/openings) are unaffected.
CREATE UNIQUE INDEX "StockMovement_orgId_clientOperationId_key" ON "StockMovement"("orgId", "clientOperationId");
