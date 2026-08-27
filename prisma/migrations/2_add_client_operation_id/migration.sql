-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "clientOperationId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "clientOperationId" TEXT;

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN "clientOperationId" TEXT;

-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN "clientOperationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Expense_orgId_clientOperationId_key" ON "Expense"("orgId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orgId_clientOperationId_key" ON "Invoice"("orgId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_orgId_clientOperationId_key" ON "Transfer"("orgId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_orgId_clientOperationId_key" ON "Voucher"("orgId", "clientOperationId");

