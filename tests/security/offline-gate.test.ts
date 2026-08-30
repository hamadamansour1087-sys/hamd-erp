/**
 * OFFLINE POS GATE — regression suite (bun:test) for the Offline POS hardening.
 *
 * Covers the three layers a cashier's offline sale crosses, in order:
 *
 *  A. SERVICE WORKER (public/sw.js — source gates)
 *     - the first-session shell gap is closed: install MUST precache `/`
 *       (validated as a complete HTML document), because the triggering
 *       navigation happens BEFORE the SW activates. The old "cached on first
 *       navigation" assumption left fresh installs with a 503 "Offline" page
 *       on the first offline reload (reproduced 2026-08-30, see
 *       scripts/offline-repro-TRUE.png).
 *     - version bump invalidates previous caches (tijara-v5).
 *     - mutations are NEVER intercepted/cached — only the JS queue handles them.
 *     - API GETs cache only 2xx and fall back to the last good response.
 *     - the last-resort offline page is an honest Arabic RTL recovery screen.
 *
 *  B. CLIENT QUEUE (src/lib/offline/queue.ts — unit, stubbed storage/fetch)
 *     - identity stamping (orgId, userId) from the boot cache.
 *     - FIFO replay with a STABLE Idempotency-Key per item.
 *     - lifecycle: 2xx → drop+count · 400/404 → poison-drop · 5xx/409 → keep+stop
 *     - fetch throw (still offline) → keep, no failure flag.
 *     - items of ANOTHER identity are HELD, never replayed (tenant isolation).
 *     - GET cache namespacing per identity + clearGetCache purge.
 *
 *  C. SERVER IDEMPOTENCY (real PostgreSQL via route handlers)
 *     - offline sale synced EXACTLY once: one invoice, one StockMovement batch,
 *       one RECEIPT voucher, claim row backfilled with resultId.
 *     - same key replay → same document, no second side effect.
 *     - same key, DIFFERENT user (same org) → 403 duplicate-key-owner.
 *     - same key, different ORG → independent operation (claim scope = org).
 *     - invalid key charset → 400 before any DB touch.
 *     - no key → legacy behavior preserved.
 *     - stock drifted on the server while the device was offline → the sale
 *       still lands with a warnings[] (documented POS policy: sales never
 *       hard-fail on stock; the ledger records the truth).
 *     - session expired while offline (tokenVersion bumped) → 401; the client
 *       queue keeps the item for retry after re-login (asserted in B).
 *
 * Run: bun test tests/security/offline-gate.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setupPgTestDatabase } from './pg-setup'

// own database: bun runs test files in parallel
const TEST_DB_NAME = 'hamd_test_offl'

process.env.DATABASE_URL = `postgresql://hamd@127.0.0.1:5432/${TEST_DB_NAME}?connection_limit=10`
process.env.AUTH_SECRET = 'test-secret-value-at-least-16-chars-long'
process.env.NODE_ENV = 'test'

// Dynamic imports AFTER env is set (PrismaClient reads DATABASE_URL at import time)
const { db } = await import('@/lib/db')
const auth = await import('@/lib/auth')
const invoicesRoute = await import('@/app/api/invoices/route')
const { clientOperationIdFor } = await import('@/lib/api-helpers')
const { NextRequest } = await import('next/server')

type Sess = { id: string; orgId: string; role: string; tokenVersion?: number }

// ═══════════════════════════ A. SERVICE WORKER ═══════════════════════════

describe('OFFLINE-1 · Service Worker shell precache (sw.js)', () => {
  const sw = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8')

  test('cache version is bumped (v5) so stale v4 shells are evicted', () => {
    expect(sw).toContain("const VERSION = 'tijara-v5'")
  })

  test('install precaches the root shell — no first-session gap', () => {
    expect(sw).toContain("const PRECACHE = ['/'")
    // the old skip that caused the bug must be gone
    expect(sw).not.toContain("if (url === '/') return")
  })

  test('precache validates the shell as a COMPLETE html document', () => {
    // asCompleteHtml must be called in BOTH install and handleNavigation
    const calls = sw.match(/asCompleteHtml\(/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(2)
    // completeness rule: </html> suffix + content-type check
    expect(sw).toContain("endsWith('</html>')")
    expect(sw).toContain("includes('text/html')")
  })

  test('mutating requests are NEVER intercepted — always passthrough', () => {
    expect(sw).toContain("if (req.method !== 'GET') return")
    // no cache.put for non-GET: every put sits behind an ok-guarded read path
    expect(sw).toContain('handleNavigation')
  })

  test('API GET: network-first, caches ONLY 2xx, falls back to last good data', () => {
    expect(sw).toContain('async function handleApiGet(req)')
    expect(sw).toContain('if (res && res.ok)')
    expect(sw).toContain('caches.match(req)')
  })

  test('last-resort offline page is an Arabic RTL recovery screen (503)', () => {
    expect(sw).toContain('لا يوجد اتصال بالإنترنت')
    expect(sw).toContain('dir="rtl"')
    expect(sw).toContain('location.reload()')
    expect(sw).toContain('status: 503')
  })
})

// ═══════════════════════════ B. CLIENT QUEUE ═══════════════════════════

function makeLsStub(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    clear: () => void m.clear(),
    get length() {
      return m.size
    },
  } as unknown as Storage
}

describe('OFFLINE-3/4 · offline mutation queue (unit, stubbed storage)', () => {
  const origLs = globalThis.localStorage
  const origFetch = globalThis.fetch
  let ls: Storage

  beforeAll(() => {
    ls = makeLsStub()
    ;(globalThis as { localStorage: Storage }).localStorage = ls
  })
  afterAll(() => {
    ;(globalThis as { localStorage: Storage }).localStorage = origLs
    globalThis.fetch = origFetch
  })

  const queue = (async () => await import('@/lib/offline/queue'))()

  function seedIdentity(userId = 'u1', orgId = 'o1') {
    ls.setItem('tijara-boot-cache', JSON.stringify({ user: { id: userId, orgId } }))
  }
  function readQueue(): Array<Record<string, unknown>> {
    return JSON.parse(ls.getItem('tijara-mq') ?? '[]')
  }

  test('enqueue stamps the CURRENT identity from the boot cache', async () => {
    const q = await queue
    ls.clear()
    seedIdentity('cashier-9', 'org-77')
    q.enqueue({ url: '/api/invoices', method: 'POST', body: { total: 10 } })
    const items = readQueue()
    expect(items).toHaveLength(1)
    expect(items[0].orgId).toBe('org-77')
    expect(items[0].userId).toBe('cashier-9')
    expect(typeof items[0].id).toBe('string')
    expect((items[0].id as string).length).toBeGreaterThanOrEqual(6)
  })

  test('flush replays FIFO with a STABLE Idempotency-Key; 2xx drops the item', async () => {
    const q = await queue
    ls.clear()
    seedIdentity()
    q.enqueue({ url: '/api/invoices', method: 'POST', body: { i: 1 } })
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof fetch

    const before = readQueue()
    const res = await q.flushQueue()
    expect(res.ok).toBe(1)
    expect(res.failed).toBe(false)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/invoices')
    expect(calls[0].init.method).toBe('POST')
    expect((calls[0].init.headers as Record<string, string>)['Idempotency-Key']).toBe(before[0].id)
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(readQueue()).toHaveLength(0)
  })

  test('400/404 are poison-dropped (never retried) without counting ok', async () => {
    const q = await queue
    ls.clear()
    seedIdentity()
    q.enqueue({ url: '/api/invoices', method: 'POST', body: { bad: true } })
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'x' }), { status: 400 })) as typeof fetch
    const res = await q.flushQueue()
    expect(res.ok).toBe(0)
    expect(res.failed).toBe(false)
    expect(readQueue()).toHaveLength(0)
  })

  test('5xx / 409 keep the item and stop the flush (retry later)', async () => {
    const q = await queue
    ls.clear()
    seedIdentity()
    q.enqueue({ url: '/api/invoices', method: 'POST', body: { i: 1 } })
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'conflict' }), { status: 409 })) as typeof fetch
    const res = await q.flushQueue()
    expect(res.failed).toBe(true)
    expect(readQueue()).toHaveLength(1)
  })

  test('fetch throw (still offline) keeps the queue silently', async () => {
    const q = await queue
    ls.clear()
    seedIdentity()
    q.enqueue({ url: '/api/invoices', method: 'POST', body: { i: 1 } })
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    const res = await q.flushQueue()
    expect(res.failed).toBe(false)
    expect(readQueue()).toHaveLength(1)
  })

  test('OFFLINE-7 · another user/org items are HELD — never replayed cross-tenant', async () => {
    const q = await queue
    ls.clear()
    seedIdentity('u-current', 'org-current')
    // item belonging to a DIFFERENT identity lands in the same storage
    const items = [
      {
        id: 'otheruser-item-1',
        url: '/api/invoices',
        method: 'POST',
        body: { evil: true },
        at: Date.now(),
        orgId: 'org-other',
        userId: 'u-other',
      },
    ]
    ls.setItem('tijara-mq', JSON.stringify(items))
    const calls: unknown[] = []
    globalThis.fetch = (async (_u: string, _i: RequestInit) => {
      calls.push(1)
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof fetch

    const res = await q.flushQueue()
    expect(res.held).toBe(1)
    expect(res.ok).toBe(0)
    expect(calls).toHaveLength(0) // nothing was sent under the wrong identity
    const after = readQueue()
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe('otheruser-item-1')
  })

  test('GET cache is namespaced per identity and clearGetCache purges it', async () => {
    const q = await queue
    ls.clear()
    seedIdentity('u1', 'o1')
    q.cacheSet('/api/bootstrap', { hello: 1 })
    expect(ls.getItem('tijara-get:o1:u1:/api/bootstrap')).not.toBeNull()
    expect(q.cacheGet<{ hello: number }>('/api/bootstrap')).toEqual({ hello: 1 })
    // another identity must NOT see it
    seedIdentity('u2', 'o2')
    expect(q.cacheGet<{ hello: number }>('/api/bootstrap')).toBeNull()
    const { clearGetCache } = await import('@/lib/offline/cache-purge')
    seedIdentity('u1', 'o1')
    q.cacheSet('/api/bootstrap', { hello: 1 })
    clearGetCache()
    expect(q.cacheGet<{ hello: number }>('/api/bootstrap')).toBeNull()
  })

  test('OFFLINE-8 · requestJson queues the mutation on fetch-throw even when navigator.onLine is TRUE', async () => {
    // the dead-server scenario: the device says "online" but the server is
    // unreachable — the sale MUST queue, never error out (reproduced live
    // 2026-08-30: checkout behind a stopped server threw and lost the sale).
    const q = await queue
    ls.clear()
    seedIdentity('u-pos', 'org-pos')
    const { requestJson, ApiError: Err } = await import('@/hooks/use-api')
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    let caught: unknown = null
    try {
      await requestJson('/api/invoices', { method: 'POST', body: JSON.stringify({ total: 293.25 }) })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Err)
    expect((caught as InstanceType<typeof Err>).queued).toBe(true)
    const items = readQueue()
    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('/api/invoices')
    expect(items[0].userId).toBe('u-pos')
    globalThis.fetch = origFetch
  })
})

describe('OFFLINE-9 · session-expiry gate (401) and permission rejects (403) in flush', () => {
  const origLs = globalThis.localStorage
  const origFetch = globalThis.fetch
  let ls: Storage

  beforeAll(() => {
    ls = makeLsStub()
    ;(globalThis as { localStorage: Storage }).localStorage = ls
  })
  afterAll(() => {
    ;(globalThis as { localStorage: Storage }).localStorage = origLs
    globalThis.fetch = origFetch
  })

  const queue = (async () => await import('@/lib/offline/queue'))()

  function seedIdentity(userId = 'u1', orgId = 'o1') {
    ls.setItem('tijara-boot-cache', JSON.stringify({ user: { id: userId, orgId } }))
  }
  function readQueue(): Array<Record<string, unknown>> {
    return JSON.parse(ls.getItem('tijara-mq') ?? '[]')
  }

  test('401 mid-replay → sessionExpired, ALL items kept, gate blocks further replays', async () => {
    const q = await queue
    q.resetSessionExpiry()
    ls.clear()
    seedIdentity('cashier-a', 'org-a')
    q.enqueue({ url: '/api/invoices', method: 'POST', body: { sale: 1 } })
    q.enqueue({ url: '/api/invoices', method: 'POST', body: { sale: 2 } })
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response(JSON.stringify({ error: 'invalid-session' }), { status: 401 })
    }) as typeof fetch

    const res = await q.flushQueue()
    expect(res.sessionExpired).toBe(true)
    expect(res.failed).toBe(false)
    expect(res.ok).toBe(0)
    expect(calls).toBe(1) // stops at the FIRST 401 — never touches item 2
    expect(readQueue()).toHaveLength(2) // financial data is KEPT, never dropped

    // gate: subsequent flushes (20s poll) make ZERO network calls
    const res2 = await q.flushQueue()
    expect(res2.sessionExpired).toBe(true)
    expect(calls).toBe(1)
    expect(readQueue()).toHaveLength(2)
  })

  test('resetSessionExpiry (re-login) re-arms the replay and items sync once', async () => {
    const q = await queue
    // NOTE: no ls.clear() — this simulates the SAME device AFTER re-login:
    // the two items kept by the 401 gate above must still be here.
    seedIdentity('cashier-a', 'org-a') // SAME user signs back in
    const ids = readQueue().map((i) => i.id)
    expect(ids.length).toBe(2)
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof fetch

    q.resetSessionExpiry()
    const res = await q.flushQueue()
    expect(res.sessionExpired).toBeUndefined()
    expect(res.ok).toBe(2) // both offline sales delivered exactly once
    expect(calls).toBe(2)
    expect(readQueue()).toHaveLength(0)
  })

  test('403 mid-replay → permanently rejected item is dropped (counted), flush continues', async () => {
    const q = await queue
    q.resetSessionExpiry()
    ls.clear()
    seedIdentity('cashier-b', 'org-b')
    q.enqueue({ url: '/api/products', method: 'POST', body: { forbidden: true } })
    q.enqueue({ url: '/api/expenses', method: 'POST', body: { allowed: true } })
    const statuses = [403, 200]
    globalThis.fetch = (async () => {
      const s = statuses.shift() ?? 200
      return new Response(JSON.stringify({}), { status: s })
    }) as typeof fetch

    const res = await q.flushQueue()
    expect(res.rejected).toBe(1)
    expect(res.ok).toBe(1)
    expect(res.failed).toBe(false)
    expect(readQueue()).toHaveLength(0) // poison item gone, allowed item synced
  })
})

// ═══════════════════════ C. SERVER IDEMPOTENCY ═══════════════════════

let org1: { id: string }
let org2: { id: string }
let cashier1: { id: string; tokenVersion: number }
let admin1: { id: string; tokenVersion: number }
let admin2: { id: string; tokenVersion: number }
let wh1: { id: string }
let wh2: { id: string }
let prod1: { id: string }
let prod2: { id: string }
let cust1: { id: string }

function makeReq(
  url: string,
  opts: { method?: string; body?: unknown; session?: Sess; headers?: Record<string, string> } = {}
): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json', ...(opts.headers || {}) })
  if (opts.session) {
    const token = auth.createToken(opts.session.id, opts.session.tokenVersion ?? 0)
    headers.set('cookie', `session=${token}`)
  }
  return new NextRequest(`http://localhost${url}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
}

const json = async (res: Response) => {
  const j = await res.json().catch(() => ({})) as Record<string, unknown>
  // success envelope: {ok, data: {...}} · error envelope: {ok, error} — unwrap data
  return { status: res.status, json: ((j.data ?? j) as Record<string, unknown>) }
}

const cashierSess = () => ({ id: cashier1.id, orgId: org1.id, role: 'CASHIER', tokenVersion: cashier1.tokenVersion }) as Sess
const admin1Sess = () => ({ id: admin1.id, orgId: org1.id, role: 'ADMIN', tokenVersion: admin1.tokenVersion }) as Sess
const admin2Sess = () => ({ id: admin2.id, orgId: org2.id, role: 'ADMIN', tokenVersion: admin2.tokenVersion }) as Sess

async function saleBody(over: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return {
    type: 'SALE',
    customerId: cust1.id,
    warehouseId: wh1.id,
    items: [{ productId: prod1.id, qty: 2, price: 100 }],
    paidAmount: 200,
    paidMethod: 'CASH',
    ...over,
  }
}

beforeAll(async () => {
  setupPgTestDatabase(TEST_DB_NAME)
  await db.idempotencyKey.deleteMany()
  await db.voucher.deleteMany()
  await db.invoiceItem.deleteMany()
  await db.invoice.deleteMany()
  await db.stockMovement.deleteMany()
  await db.stockLevel.deleteMany()
  await db.expense.deleteMany()
  await db.product.deleteMany()
  await db.customer.deleteMany()
  await db.supplier.deleteMany()
  await db.warehouse.deleteMany()
  await db.user.deleteMany()
  await db.counter.deleteMany()
  await db.category.deleteMany()
  await db.unit.deleteMany()
  await db.org.deleteMany()

  org1 = await db.org.create({ data: { name: 'Offl Org 1', taxPercent: 0 } })
  org2 = await db.org.create({ data: { name: 'Offl Org 2', taxPercent: 0 } })
  const pw = auth.hashPassword('offl-pass-123')
  cashier1 = await db.user.create({
    data: { orgId: org1.id, email: 'cashier@offl.test', name: 'Cashier Offl', passwordHash: pw, role: 'CASHIER', tokenVersion: 0 },
  })
  admin1 = await db.user.create({
    data: { orgId: org1.id, email: 'admin1@offl.test', name: 'Admin 1', passwordHash: pw, role: 'ADMIN', tokenVersion: 0 },
  })
  admin2 = await db.user.create({
    data: { orgId: org2.id, email: 'admin2@offl.test', name: 'Admin 2', passwordHash: pw, role: 'ADMIN', tokenVersion: 0 },
  })
  wh1 = await db.warehouse.create({ data: { orgId: org1.id, name: 'WH-1', isDefault: true } })
  wh2 = await db.warehouse.create({ data: { orgId: org2.id, name: 'WH-2', isDefault: true } })
  prod1 = await db.product.create({ data: { orgId: org1.id, name: 'Prod Offl 1', price: 100, cost: 50, trackStock: true } })
  prod2 = await db.product.create({ data: { orgId: org2.id, name: 'Prod Offl 2', price: 30, cost: 10, trackStock: true } })
  cust1 = await db.customer.create({ data: { orgId: org1.id, name: 'Cust Offl', openingBalance: 0 } })
  await db.stockLevel.create({ data: { productId: prod1.id, warehouseId: wh1.id, qty: 50 } })
  await db.stockLevel.create({ data: { productId: prod2.id, warehouseId: wh2.id, qty: 10 } })
})

afterAll(async () => {
  await db.$disconnect()
})

describe('OFFLINE-5 · offline sale syncs EXACTLY once (server)', () => {
  test('first sync: one invoice + one movement batch + one RECEIPT voucher + claim backfilled', async () => {
    const res = await json(
      await invoicesRoute.POST(
        makeReq('/api/invoices', {
          method: 'POST',
          session: cashierSess(),
          headers: { 'Idempotency-Key': 'offl-key-2026-0001' },
          body: await saleBody(),
        })
      )
    )
    expect(res.status).toBe(200)
    expect(res.json.duplicate).toBe(false)
    expect(res.json.status).toBe('PAID')
    const invoiceId = res.json.id as string

    expect(await db.invoice.count({ where: { orgId: org1.id, type: 'SALE' } })).toBe(1)
    expect(await db.stockMovement.count({ where: { orgId: org1.id, refId: invoiceId } })).toBe(1)
    const mv = await db.stockMovement.findFirst({ where: { orgId: org1.id, refId: invoiceId } })
    expect(Number(mv?.qty)).toBe(-2)
    const vouchers = await db.voucher.findMany({ where: { orgId: org1.id, invoiceId } })
    expect(vouchers).toHaveLength(1)
    expect(vouchers[0].type).toBe('RECEIPT')
    expect(Number(vouchers[0].amount)).toBe(200)
    // stock applied once: 50 - 2
    const sl = await db.stockLevel.findFirst({ where: { productId: prod1.id, warehouseId: wh1.id } })
    expect(Number(sl?.qty)).toBe(48)
    const claim = await db.idempotencyKey.findFirst({ where: { orgId: org1.id, resultId: invoiceId } })
    expect(claim).not.toBeNull()
  })

  test('OFFLINE-6 · replay with the SAME key returns the SAME invoice — zero new side effects', async () => {
    const res = await json(
      await invoicesRoute.POST(
        makeReq('/api/invoices', {
          method: 'POST',
          session: cashierSess(),
          headers: { 'Idempotency-Key': 'offl-key-2026-0001' },
          body: await saleBody(),
        })
      )
    )
    expect(res.status).toBe(200)
    expect(res.json.duplicate).toBe(true)
    expect(await db.invoice.count({ where: { orgId: org1.id, type: 'SALE' } })).toBe(1)
    expect(await db.stockMovement.count({ where: { orgId: org1.id } })).toBe(1)
    expect(await db.voucher.count({ where: { orgId: org1.id } })).toBe(1)
  })

  test('same key, DIFFERENT user (same org) → 403 duplicate-key-owner', async () => {
    const res = await json(
      await invoicesRoute.POST(
        makeReq('/api/invoices', {
          method: 'POST',
          session: admin1Sess(),
          headers: { 'Idempotency-Key': 'offl-key-2026-0001' },
          body: await saleBody(),
        })
      )
    )
    expect(res.status).toBe(403)
    expect(res.json.error).toBe('duplicate-key-owner')
    expect(await db.invoice.count({ where: { orgId: org1.id, type: 'SALE' } })).toBe(1)
  })

  test('same key, different ORG → independent operation (tenant-scoped claims)', async () => {
    const res = await json(
      await invoicesRoute.POST(
        makeReq('/api/invoices', {
          method: 'POST',
          session: admin2Sess(),
          headers: { 'Idempotency-Key': 'offl-key-2026-0001' },
          body: {
            type: 'SALE',
            warehouseId: wh2.id,
            items: [{ productId: prod2.id, qty: 1, price: 30 }],
            paidAmount: 30,
            paidMethod: 'CASH',
          },
        })
      )
    )
    expect(res.status).toBe(200)
    expect(res.json.duplicate).toBe(false)
    const inv = await db.invoice.findFirst({ where: { orgId: org2.id } })
    expect(inv).not.toBeNull()
    expect(inv?.id).toBe(res.json.id)
  })

  test('invalid key charset → 400 BEFORE any DB touch (no invoice, no claim)', () =>
    (async () => {
      const beforeInv = await db.invoice.count({ where: { orgId: org1.id } })
      const beforeClaim = await db.idempotencyKey.count()
      const res = await json(
        await invoicesRoute.POST(
          makeReq('/api/invoices', {
            method: 'POST',
            session: cashierSess(),
            headers: { 'Idempotency-Key': 'a@b#1' },
            body: await saleBody(),
          })
        )
      )
      expect(res.status).toBe(400)
      expect(res.json.error).toBe('invalid-idempotency-key')
      expect(await db.invoice.count({ where: { orgId: org1.id } })).toBe(beforeInv)
      expect(await db.idempotencyKey.count()).toBe(beforeClaim)
    })())

  test('no key → legacy behavior preserved (new invoice)', async () => {
    const before = await db.invoice.count({ where: { orgId: org1.id, type: 'SALE' } })
    const res = await json(
      await invoicesRoute.POST(makeReq('/api/invoices', { method: 'POST', session: cashierSess(), body: await saleBody() }))
    )
    expect(res.status).toBe(200)
    expect(res.json.duplicate).toBe(false)
    expect(await db.invoice.count({ where: { orgId: org1.id, type: 'SALE' } })).toBe(before + 1)
  })
})

describe('OFFLINE-2 · conflicts while the device was offline', () => {
  test('stock drifted on the server → sale still lands WITH warnings, ledger records truth', async () => {
    const beforeQty = Number((await db.stockLevel.findFirst({ where: { productId: prod1.id } }))?.qty ?? 0)
    const res = await json(
      await invoicesRoute.POST(
        makeReq('/api/invoices', {
          method: 'POST',
          session: cashierSess(),
          headers: { 'Idempotency-Key': 'offl-key-stock-001' },
          body: await saleBody({ items: [{ productId: prod1.id, qty: 500, price: 100 }], paidAmount: 50000 }),
        })
      )
    )
    expect(res.status).toBe(200)
    const warnings = res.json.warnings as string[] | undefined
    expect(Array.isArray(warnings)).toBe(true)
    expect(warnings!.length).toBeGreaterThan(0)
    const sl = await db.stockLevel.findFirst({ where: { productId: prod1.id } })
    expect(Number(sl?.qty)).toBe(beforeQty - 500)
    // replay same key → same document, no double movement
    const res2 = await json(
      await invoicesRoute.POST(
        makeReq('/api/invoices', {
          method: 'POST',
          session: cashierSess(),
          headers: { 'Idempotency-Key': 'offl-key-stock-001' },
          body: await saleBody({ items: [{ productId: prod1.id, qty: 500, price: 100 }], paidAmount: 50000 }),
        })
      )
    )
    expect(res2.status).toBe(200)
    expect(res2.json.duplicate).toBe(true)
    expect(res2.json.id).toBe(res.json.id)
    expect(await db.stockMovement.count({ where: { orgId: org1.id, productId: prod1.id, qty: -500 } })).toBe(1)
  })

  test('session expired while offline (tokenVersion bumped) → 401; queue keeps the item', async () => {
    // a synced-while-away invoice with its own key
    const res1 = await json(
      await invoicesRoute.POST(
        makeReq('/api/invoices', {
          method: 'POST',
          session: cashierSess(),
          headers: { 'Idempotency-Key': 'offl-key-exp-0001' },
          body: await saleBody(),
        })
      )
    )
    expect(res1.status).toBe(200)
    // admin disables the cashier's sessions (tokenVersion bump) while offline —
    // the DEVICE still holds the OLD token (tv=0); the server now expects tv=1.
    await db.user.update({ where: { id: cashier1.id }, data: { tokenVersion: { increment: 1 } } })
    const res2 = await json(
      await invoicesRoute.POST(
        makeReq('/api/invoices', {
          method: 'POST',
          session: cashierSess(),
          headers: { 'Idempotency-Key': 'offl-key-exp-0001' },
          body: await saleBody(),
        })
      )
    )
    expect(res2.status).toBe(401)
    // the replay created NOTHING — the claim (scoped key = invoice:SHA256(raw))
    // still points at exactly ONE invoice
    const claimExp = await db.idempotencyKey.findFirst({
      where: { orgId: org1.id, key: clientOperationIdFor('invoice', 'offl-key-exp-0001') },
    })
    expect(claimExp).not.toBeNull()
    expect(claimExp!.resultId).toBeTruthy()
    expect(await db.invoice.count({ where: { id: claimExp!.resultId! } })).toBe(1)
  })
})
