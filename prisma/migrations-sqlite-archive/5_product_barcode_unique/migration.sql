-- Barcode uniqueness per tenant: POS barcode scans must resolve to exactly one
-- product or the wrong item gets sold at the wrong price. Replaces the plain
-- lookup index with a UNIQUE one. NULL barcodes stay allowed (SQLite/Prisma
-- unique indexes treat NULLs as mutually distinct).

-- Defensive dedupe before creating the index: keep the FIRST product's barcode
-- per (orgId, barcode); NULL out duplicates so the CREATE UNIQUE INDEX can never
-- fail on legacy data.
UPDATE "Product" SET "barcode" = NULL
WHERE "barcode" IS NOT NULL
  AND "id" NOT IN (
    SELECT MIN("id") FROM "Product" WHERE "barcode" IS NOT NULL GROUP BY "orgId", "barcode"
  );

DROP INDEX IF EXISTS "Product_orgId_barcode_idx";
CREATE UNIQUE INDEX "Product_orgId_barcode_key" ON "Product"("orgId", "barcode");
