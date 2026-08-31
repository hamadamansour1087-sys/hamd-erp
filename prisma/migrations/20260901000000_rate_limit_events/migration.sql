-- RateLimitEvent: DB-backed sliding-window rate-limit ledger (multi-instance
-- safe). Created as part of the Round-3 security audit closure — moves the
-- registration anti-abuse budget from in-memory-only to a global DB ledger,
-- mirroring the LoginAttempt pattern.

CREATE TABLE "RateLimitEvent" (
    "id" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RateLimitEvent_bucketKey_createdAt_idx" ON "RateLimitEvent"("bucketKey", "createdAt");
