-- Org lifecycle (PENDING/TRIAL/ACTIVE/SUSPENDED) + platform-review fields.
-- Drift captured with `prisma migrate diff` (migrations replay vs schema datamodel):
-- the lifecycle feature shipped via schema + db push on legacy environments
-- without a recorded migration, so fresh `migrate deploy` databases lacked it.
-- Idempotent on purpose: safe on databases that already have the columns.

ALTER TABLE "Org" ADD COLUMN IF NOT EXISTS "adminNote" TEXT;
ALTER TABLE "Org" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Org" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Org" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
