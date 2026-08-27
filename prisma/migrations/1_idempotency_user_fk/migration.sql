-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_IdempotencyKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "resultId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdempotencyKey_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_IdempotencyKey" ("createdAt", "id", "key", "orgId", "resultId", "userId") SELECT "createdAt", "id", "key", "orgId", "resultId", "userId" FROM "IdempotencyKey";
DROP TABLE "IdempotencyKey";
ALTER TABLE "new_IdempotencyKey" RENAME TO "IdempotencyKey";
CREATE INDEX "IdempotencyKey_orgId_createdAt_idx" ON "IdempotencyKey"("orgId", "createdAt");
CREATE UNIQUE INDEX "IdempotencyKey_orgId_key_key" ON "IdempotencyKey"("orgId", "key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

