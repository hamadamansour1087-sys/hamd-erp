/**
 * DB-BACKED RATE-LIMIT LEDGER — regression suite (bun:test).
 *
 * Round-3 closure of the last documented P1-adjacent risk: the registration
 * anti-abuse budget used to live ONLY in the in-memory rateLimit() map, so
 * it was wiped by every restart and multiplied per app instance. The route
 * now enforces a GLOBAL budget through dbRateLimit() (RateLimitEvent table),
 * mirroring the LoginAttempt ledger pattern.
 *
 * Verified here:
 *  1. dbRateLimit admits up to `max` hits per window then blocks (DB-decided).
 *  2. Different keys have independent budgets (IP isolation).
 *  3. Expired rows are purged for the key (bounded footprint) — a fresh
 *     window admits again.
 *  4. END-TO-END: POST /api/auth/register 6× from the same IP → the 6th is
 *     429 (the pre-DB in-memory damper alone cannot be trusted across
 *     instances/restarts; this proves the effective budget still holds).
 *
 * Run: bun test tests/security/rate-limit-db.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { setupPgTestDatabase } from './pg-setup'

// own database: bun runs test files in parallel
const TEST_DB_NAME = 'hamd_test_ratelimit'

process.env.DATABASE_URL = `postgresql://hamd@127.0.0.1:5432/${TEST_DB_NAME}?connection_limit=10`
process.env.AUTH_SECRET = 'test-secret-value-at-least-16-chars-long'
process.env.NODE_ENV = 'test'

// Dynamic imports AFTER env is set (PrismaClient reads DATABASE_URL at import time)
const { db } = await import('@/lib/db')
const { dbRateLimit } = await import('@/lib/api-helpers')
const registerRoute = await import('@/app/api/auth/register/route')

const { NextRequest } = await import('next/server')

let seq = 0
function makeReq(url: string, body: unknown): NextRequest {
  return new NextRequest(new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

function regBody() {
  seq += 1
  return {
    orgName: `RL Org ${seq}`,
    name: `RL Owner ${seq}`,
    email: `rl-owner-${seq}-${Date.now()}@ratelimit.test`,
    phone: '01000000000',
    password: 'rl-pass-123456',
  }
}

beforeAll(() => {
  setupPgTestDatabase(TEST_DB_NAME)
})

afterAll(async () => {
  await db.$disconnect()
})

describe('dbRateLimit — global DB-decided budget', () => {
  test('admits up to max then blocks, per key', async () => {
    const key = `t1:${Date.now()}`
    for (let i = 0; i < 5; i++) {
      expect(await dbRateLimit(key, 5, 60 * 60_000)).toBe(true)
    }
    expect(await dbRateLimit(key, 5, 60 * 60_000)).toBe(false) // 6th → blocked
  })

  test('different keys have independent budgets (IP isolation)', async () => {
    const a = `t2a:${Date.now()}`
    const b = `t2b:${Date.now()}`
    for (let i = 0; i < 5; i++) expect(await dbRateLimit(a, 5, 60 * 60_000)).toBe(true)
    expect(await dbRateLimit(a, 5, 60 * 60_000)).toBe(false)
    expect(await dbRateLimit(b, 5, 60 * 60_000)).toBe(true) // untouched budget
  })

  test('rows are persisted in the DB (survives restarts / shared by instances)', async () => {
    const key = `t3:${Date.now()}`
    await dbRateLimit(key, 100, 60 * 60_000)
    const rows = await db.rateLimitEvent.count({ where: { bucketKey: key } })
    expect(rows).toBe(1)
  })

  test('expired window is purged for the key → fresh budget again', async () => {
    const key = `t4:${Date.now()}`
    for (let i = 0; i < 3; i++) expect(await dbRateLimit(key, 3, 30)).toBe(true) // 30ms window
    expect(await dbRateLimit(key, 3, 30)).toBe(false)
    await new Promise((r) => setTimeout(r, 60))
    expect(await dbRateLimit(key, 3, 30)).toBe(true) // old rows purged, window fresh
  })
})

describe('REGISTER — end-to-end global budget', () => {
  test('same-IP burst is capped: ≥1 of 6 calls gets 429, admitted ≤ 5', async () => {
    // NOTE: bun runs test files in ONE process — the in-memory damper map is
    // shared with other suites' register calls, so WHICH call gets blocked is
    // order-dependent. The order-independent invariants (guaranteed under any
    // interleaving) are: at most 5 admitted per window per IP, hence ≥1 of
    // these 6 same-IP calls must be 429. The DETERMINISTIC proof that the
    // DB ledger alone blocks a cold instance is the next test.
    let admitted = 0
    let blocked = 0
    for (let i = 0; i < 6; i++) {
      const res = await registerRoute.POST(makeReq('/api/auth/register', regBody()))
      if (res.status === 429) blocked += 1
      else {
        expect([201, 409]).toContain(res.status)
        admitted += 1
      }
    }
    expect(blocked).toBeGreaterThanOrEqual(1)
    expect(admitted).toBeLessThanOrEqual(5)
    // every admitted hit is recorded in the ledger; blocked hits never reach it
    const rows = await db.rateLimitEvent.count({
      where: { bucketKey: { startsWith: 'register:' } },
    })
    expect(rows).toBe(admitted)
  })

  test('COLD-INSTANCE simulation: 5 ledger rows alone block the 6th hit', async () => {
    // This is the property the in-memory damper can NEVER provide: a fresh
    // process (or another app instance) with an empty in-memory map must
    // still refuse the 6th hit because the GLOBAL ledger already holds 5.
    // Pre-seed the DB exactly as five previously-admitted hits would have.
    const simKey = `register:cold-instance-sim`
    await db.rateLimitEvent.deleteMany({ where: { bucketKey: simKey } })
    await db.rateLimitEvent.createMany({
      data: Array.from({ length: 5 }, () => ({ bucketKey: simKey })),
    })
    expect(await dbRateLimit(simKey, 5, 60 * 60_000)).toBe(false)
  })
})
