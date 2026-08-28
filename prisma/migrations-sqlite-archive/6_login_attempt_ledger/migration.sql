-- Brute-force ledger: one row per FAILED login attempt. DB-backed so the
-- per-account failure cap is enforced globally (survives restarts, correct
-- across multiple app instances). The in-memory limiter stays only as a cheap
-- pre-auth DoS damper. Successful logins are never recorded (fail-only), so
-- an attacker cannot lock a real user out by spamming their address.
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");
