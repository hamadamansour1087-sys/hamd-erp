-- Server-side negative-stock policy switch (org-level setting on the EXISTING
-- org settings mechanism). true (default) preserves the documented current
-- behavior: sales may drive tracked stock below zero with a warning. When an
-- admin sets it to false, sales / purchase cancellations become atomically
-- rejected (conditional UPDATE, no read-then-write race) when stock < requested.
-- Stock transfers ALWAYS enforce stock >= requested (see transfers route).

-- AlterTable
ALTER TABLE "Org" ADD COLUMN "allowNegativeStock" BOOLEAN NOT NULL DEFAULT true;
