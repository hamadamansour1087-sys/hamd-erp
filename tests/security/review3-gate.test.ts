/**
 * REVIEW-3 GATE — regression suite (bun:test) for the third security review
 * fixes (on top of 537c117):
 *
 *  - R3-1: logo WRITE/READ parity — settings/org PUT now enforces the SAME
 *    strict allowlist the PDF render path uses (shared module
 *    src/lib/logo-allowlist.ts). The old prefix-only write check accepted
 *    breakout-shaped values like `data:image/png;base64,AAAA" onerror=...`;
 *    they must be refused at the write itself now. Unit tests pin the shared
 *    rule directly (it is the single source for both sides).
 *  - R3-2: products POST maps an in-transaction FK violation (concurrent
 *    delete of a pre-validated warehouse/category/unit landing between the
 *    up-front checks and the write tx) to 409 'reference-vanished' instead of
 *    an opaque 500. The race window itself is not deterministically
 *    reproducible in-process (no hook between validation and tx), so the
 *    mapping is code-reviewed and its building block (isFkViolation) is
 *    exercised by the R2-L04 warehouse-DELETE tests; this file pins the
 *    NORMAL create path still works end-to-end after the refactor.
 *  - R3-3: cross-type party ids are rejected LOUDLY (400 party-type-mismatch)
 *    instead of resolving the party, snapshotting its name and silently
 *    dropping the FK link. Correct pairings (RECEIPT+customer /
 *    PAYMENT+supplier) keep working.
 *  - R3-6: report-pdf esc() escapes single quotes as well (code-reviewed;
 *    no single-quoted attribute context exists in the template today).
 *
 * Run: bun test tests/security/review3-gate.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { setupPgTestDatabase } from './pg-setup'

// own database: bun runs test files in parallel
const TEST_DB_NAME = 'hamd_test_r3'

process.env.DATABASE_URL = `postgresql://hamd@127.0.0.1:5432/${TEST_DB_NAME}?connection_limit=10`
process.env.AUTH_SECRET = 'test-secret-value-at-least-16-chars-long'
process.env.NODE_ENV = 'test'

// Dynamic imports AFTER env is set (PrismaClient reads DATABASE_URL at import time)
const { db } = await import('@/lib/db')
const auth = await import('@/lib/auth')
const vouchersRoute = await import('@/app/api/vouchers/route')
const productsRoute = await import('@/app/api/products/route')
const orgSettingsRoute = await import('@/app/api/settings/org/route')
const { isValidLogoDataUrl } = await import('@/lib/logo-allowlist')

const { NextRequest } = await import('next/server')

type Sess = { id: string; orgId: string; role: string; tokenVersion?: number }

let orgG: { id: string }
let adminG: { id: string; tokenVersion: number }

function makeReq(
  url: string,
  opts: {
    method?: string
    body?: unknown
    session?: Sess
    headers?: Record<string, string>
  } = {}
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
  const j = await res.json().catch(() => ({}))
  return { status: res.status, json: j }
}

const adminSess = () => ({ id: adminG.id, orgId: orgG.id, role: 'ADMIN' }) as Sess

beforeAll(async () => {
  setupPgTestDatabase(TEST_DB_NAME)
  orgG = await db.org.create({ data: { name: 'R3 Org' } })
  adminG = await db.user.create({
    data: { orgId: orgG.id, email: 'admin@r3.test', name: 'R3 Admin', passwordHash: auth.hashPassword('r3-pass-123'), role: 'ADMIN' },
  })
})

afterAll(async () => {
  await db.$disconnect()
})

// ─────────── R3-1: shared logo allowlist (unit level) ───────────

describe('R3-1 — isValidLogoDataUrl (shared write/read rule)', () => {
  test('accepts every allowed raster format with pure base64 payload', () => {
    expect(isValidLogoDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(isValidLogoDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true)
    expect(isValidLogoDataUrl('data:image/webp;base64,UklGRh4A')).toBe(true)
    expect(isValidLogoDataUrl('data:image/gif;base64,R0lGODlhAQ==')).toBe(true)
  })

  test('REJECTS the base64-prefixed attribute breakout (passed the old prefix-only check)', () => {
    const payload = 'data:image/png;base64,AAAA" onerror="alert(1)'
    expect(/^data:image\/(png|jpe?g|webp|gif);base64,/.test(payload)).toBe(true) // old check passed
    expect(isValidLogoDataUrl(payload)).toBe(false) // strict rule refuses
  })

  test('REJECTS charset breaks, svg, missing base64, junk', () => {
    expect(isValidLogoDataUrl('data:image/png;base64,AAAA BBBB')).toBe(false) // space
    expect(isValidLogoDataUrl('data:image/svg+xml;base64,PHN2Zy8+')).toBe(false)
    expect(isValidLogoDataUrl('data:image/png,1" onerror="x')).toBe(false)
    expect(isValidLogoDataUrl('http://evil.example/logo.png')).toBe(false)
    expect(isValidLogoDataUrl('')).toBe(false)
    expect(isValidLogoDataUrl(null)).toBe(false)
    expect(isValidLogoDataUrl(undefined)).toBe(false)
  })

  test('enforces the 600KB cap even on a pure-charset payload', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(600_001)
    expect(isValidLogoDataUrl(big)).toBe(false)
    const ok = 'data:image/png;base64,' + 'A'.repeat(600_000 - 22)
    expect(isValidLogoDataUrl(ok)).toBe(true)
  })
})

// ─────────── R3-1: settings/org PUT now refuses breakout shapes ───────────

describe('R3-1 — settings/org PUT write-path parity', () => {
  test('base64-prefixed breakout payload → 400 invalid-logo (was stored before)', async () => {
    const res = await orgSettingsRoute.PUT(
      makeReq('/api/settings/org', {
        method: 'PUT',
        session: adminSess(),
        body: { logo: 'data:image/png;base64,AAAA" onerror="alert(1)' },
      })
    )
    const r = await json(res)
    expect(r.status).toBe(400)
    expect(r.json.error).toBe('invalid-logo')
  })

  test('charset-broken payload (space) → 400 invalid-logo', async () => {
    const res = await orgSettingsRoute.PUT(
      makeReq('/api/settings/org', {
        method: 'PUT',
        session: adminSess(),
        body: { logo: 'data:image/png;base64,AAAA BBBB' },
      })
    )
    expect((await json(res)).status).toBe(400)
  })

  test('valid tiny PNG is still accepted and stored (no over-blocking)', async () => {
    // 1x1 transparent PNG
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const res = await orgSettingsRoute.PUT(
      makeReq('/api/settings/org', { method: 'PUT', session: adminSess(), body: { logo: png } })
    )
    const r = await json(res)
    expect(r.status).toBe(200)
    expect(r.json.data.logo).toBe(png)
  })
})

// ─────────── R3-3: cross-type party ids rejected loudly ───────────

describe('R3-3 — voucher cross-type party rejection', () => {
  let customer: { id: string }
  let supplier: { id: string }

  beforeAll(async () => {
    customer = await db.customer.create({
      data: { orgId: orgG.id, name: 'R3 Customer', phone: '100' },
    })
    supplier = await db.supplier.create({
      data: { orgId: orgG.id, name: 'R3 Supplier', phone: '200' },
    })
  })

  test('RECEIPT + supplierId → 400 party-type-mismatch, no voucher created', async () => {
    const before = await db.voucher.count({ where: { orgId: orgG.id } })
    const res = await vouchersRoute.POST(
      makeReq('/api/vouchers', {
        method: 'POST',
        session: adminSess(),
        body: { type: 'RECEIPT', amount: 50, supplierId: supplier.id },
      })
    )
    const r = await json(res)
    expect(r.status).toBe(400)
    expect(r.json.error).toBe('party-type-mismatch')
    expect(await db.voucher.count({ where: { orgId: orgG.id } })).toBe(before)
  })

  test('PAYMENT + customerId → 400 party-type-mismatch, no voucher created', async () => {
    const before = await db.voucher.count({ where: { orgId: orgG.id } })
    const res = await vouchersRoute.POST(
      makeReq('/api/vouchers', {
        method: 'POST',
        session: adminSess(),
        body: { type: 'PAYMENT', amount: 50, customerId: customer.id },
      })
    )
    const r = await json(res)
    expect(r.status).toBe(400)
    expect(r.json.error).toBe('party-type-mismatch')
    expect(await db.voucher.count({ where: { orgId: orgG.id } })).toBe(before)
  })

  test('correct pairings still work: RECEIPT+customer and PAYMENT+supplier', async () => {
    const rc = await vouchersRoute.POST(
      makeReq('/api/vouchers', {
        method: 'POST',
        session: adminSess(),
        body: { type: 'RECEIPT', amount: 25, customerId: customer.id },
      })
    )
    expect((await json(rc)).status).toBe(200)
    const pm = await vouchersRoute.POST(
      makeReq('/api/vouchers', {
        method: 'POST',
        session: adminSess(),
        body: { type: 'PAYMENT', amount: 35, supplierId: supplier.id },
      })
    )
    expect((await json(pm)).status).toBe(200)
  })
})

// ─────────── R3-2: products create path still end-to-end green ───────────

describe('R3-2 — products POST normal path after FK-mapping refactor', () => {
  test('product with openings still creates product + stockLevel + OPENING movement', async () => {
    const wh = await db.warehouse.create({ data: { orgId: orgG.id, name: 'R3 WH' } })
    const res = await productsRoute.POST(
      makeReq('/api/products', {
        method: 'POST',
        session: adminSess(),
        body: { name: 'R3 Product', openingQty: [{ warehouseId: wh.id, qty: 7 }] },
      })
    )
    const r = await json(res)
    expect(r.status).toBe(200)
    expect(r.json.data.levels).toHaveLength(1)
    expect(r.json.data.levels[0].qty).toBe(7)
    const mv = await db.stockMovement.findFirst({
      where: { orgId: orgG.id, productId: r.json.data.id, kind: 'OPENING' },
    })
    expect(mv).not.toBeNull()
    expect(Number(mv!.qty)).toBe(7)
  })
})
