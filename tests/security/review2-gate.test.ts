/**
 * REVIEW-2 GATE — regression suite (bun:test) for the second security review
 * fixes (commit series following dbab145):
 *
 *  - R2-HIGH: stored-XSS logo policy — settings/org PUT rejects attribute-
 *    breakout payloads (`data:image/png,1" onerror=...`) and SVG; the report
 *    PDF side mirrors the same strict allowlist (code-reviewed).
 *  - R2-MED: voucher DELETE lost update — two concurrent deletes of two
 *    vouchers on the same invoice must BOTH reverse paidAmount (CAS loop);
 *    final paidAmount is order-independent and exact.
 *  - R2-L01: login timing oracle — a DISABLED account with the CORRECT
 *    password still burns the KDF and gets 401 (no fast-path boolean oracle);
 *    re-enabling the account restores login.
 *  - R2-L02: POST /api/users — duplicate email through the DB unique
 *    constraint answers 400 'email-taken' (no find-first pre-check).
 *  - R2-L03: partyName anti-spoofing — a client-supplied partyName can never
 *    override the linked party's DB name; free text only for walk-in vouchers.
 *  - R2-L04: warehouse delete race — RESTRICT FKs: warehouse referenced by a
 *    transfer is refused by the route (409 in-use) AND by the database (P2003).
 *  - R2-L05: products openingQty — unknown warehouse / non-positive qty fail
 *    LOUDLY (400) instead of being silently skipped.
 *
 * Run: bun test tests/security/review2-gate.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { setupPgTestDatabase } from './pg-setup'

// own database: bun runs test files in parallel
const TEST_DB_NAME = 'hamd_test_r2'

process.env.DATABASE_URL = `postgresql://hamd@127.0.0.1:5432/${TEST_DB_NAME}?connection_limit=10`
process.env.AUTH_SECRET = 'test-secret-value-at-least-16-chars-long'
process.env.NODE_ENV = 'test'

// Dynamic imports AFTER env is set (PrismaClient reads DATABASE_URL at import time)
const { db } = await import('@/lib/db')
const auth = await import('@/lib/auth')
const vouchersRoute = await import('@/app/api/vouchers/route')
const voucherDetailRoute = await import('@/app/api/vouchers/[id]/route')
const productsRoute = await import('@/app/api/products/route')
const loginRoute = await import('@/app/api/auth/login/route')
const usersRoute = await import('@/app/api/users/route')
const orgSettingsRoute = await import('@/app/api/settings/org/route')

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
  orgG = await db.org.create({ data: { name: 'R2 Org' } })
  adminG = await db.user.create({
    data: { orgId: orgG.id, email: 'admin@r2.test', name: 'R2 Admin', passwordHash: auth.hashPassword('r2-pass-123'), role: 'ADMIN' },
  })
})

afterAll(async () => {
  await db.$disconnect()
})

// ─────────── R2-L03: partyName anti-spoofing ───────────

describe('R2-L03 — voucher partyName anti-spoofing', () => {
  test('linked customer: client partyName is IGNORED, DB name wins', async () => {
    const cust = await db.customer.create({ data: { orgId: orgG.id, name: 'العميل الحقيقي', phone: '123' } })
    const res = await json(await vouchersRoute.POST(makeReq('/api/vouchers', {
      method: 'POST', session: adminSess(),
      body: { type: 'RECEIPT', amount: 50, customerId: cust.id, partyName: 'اسم مزوّر HACKED' },
    })))
    expect(res.status).toBe(200)
    const v = await db.voucher.findFirst({ where: { orgId: orgG.id, customerId: cust.id } })
    expect(v?.partyName).toBe('العميل الحقيقي')
    expect(v?.partyName).not.toBe('اسم مزوّر HACKED')
  })

  test('linked supplier: DB name wins over spoofed body name', async () => {
    const sup = await db.supplier.create({ data: { orgId: orgG.id, name: 'المورد الرسمي' } })
    const res = await json(await vouchersRoute.POST(makeReq('/api/vouchers', {
      method: 'POST', session: adminSess(),
      body: { type: 'PAYMENT', amount: 70, supplierId: sup.id, partyName: 'FAKE SUPPLIER' },
    })))
    expect(res.status).toBe(200)
    const v = await db.voucher.findFirst({ where: { orgId: orgG.id, supplierId: sup.id } })
    expect(v?.partyName).toBe('المورد الرسمي')
  })

  test('walk-in (no party): free-text partyName still honored', async () => {
    const res = await json(await vouchersRoute.POST(makeReq('/api/vouchers', {
      method: 'POST', session: adminSess(),
      body: { type: 'RECEIPT', amount: 30, partyName: 'عميل نقدي' },
    })))
    expect(res.status).toBe(200)
    const v = await db.voucher.findFirst({ where: { orgId: orgG.id, amount: 30, customerId: null, supplierId: null } })
    expect(v?.partyName).toBe('عميل نقدي')
  })
})

// ─────────── R2-MED: voucher DELETE lost update (CAS) ───────────

describe('R2-MED — concurrent voucher DELETE reversals (CAS)', () => {
  test('two concurrent deletes of two vouchers both reverse paidAmount', async () => {
    const wh = await db.warehouse.create({ data: { orgId: orgG.id, name: 'R2-WH-DEL' } })
    const inv = await db.invoice.create({
      data: { orgId: orgG.id, number: 9001, type: 'SALE', total: 1000, paidAmount: 0, status: 'UNPAID', warehouseId: wh.id },
    })
    const r1 = await json(await vouchersRoute.POST(makeReq('/api/vouchers', {
      method: 'POST', session: adminSess(),
      body: { type: 'RECEIPT', amount: 400, invoiceId: inv.id, customerId: (await db.customer.create({ data: { orgId: orgG.id, name: 'C-del' } })).id },
    })))
    expect(r1.status).toBe(200)
    // second voucher created directly (its paidAmount effect is not simulated —
    // the DELETE route recomputes from the live invoice row inside its CAS loop)
    const v2 = await db.voucher.create({
      data: { orgId: orgG.id, number: 9002, type: 'RECEIPT', amount: 300, invoiceId: inv.id, partyName: 'C-del' },
    })
    const v1 = await db.voucher.findFirst({ where: { orgId: orgG.id, invoiceId: inv.id, amount: 400 } })
    expect(v1).toBeTruthy()
    expect(await db.invoice.findUnique({ where: { id: inv.id } }).then((i) => Number(i?.paidAmount))).toBe(400)

    // fire both deletes CONCURRENTLY — CAS loops must serialize the reversals
    const [d1, d2] = await Promise.all([
      json(await voucherDetailRoute.DELETE(makeReq(`/api/vouchers/${v1!.id}`, { method: 'DELETE', session: adminSess() }), { params: Promise.resolve({ id: v1!.id }) })),
      json(await voucherDetailRoute.DELETE(makeReq(`/api/vouchers/${v2.id}`, { method: 'DELETE', session: adminSess() }), { params: Promise.resolve({ id: v2.id }) })),
    ])
    expect(d1.status).toBe(200)
    expect(d2.status).toBe(200)

    const after = await db.invoice.findUnique({ where: { id: inv.id } })
    expect(Number(after?.paidAmount)).toBe(0)
    expect(after?.status).toBe('UNPAID')
    expect(await db.voucher.count({ where: { invoiceId: inv.id } })).toBe(0)
  })

  test('delete of an already-deleted voucher → 404 (no double reversal)', async () => {
    const inv = await db.invoice.create({
      data: { orgId: orgG.id, number: 9003, type: 'SALE', total: 500, paidAmount: 200, status: 'PARTIAL' },
    })
    const v = await db.voucher.create({
      data: { orgId: orgG.id, number: 9004, type: 'RECEIPT', amount: 200, invoiceId: inv.id, partyName: 'x' },
    })
    const first = await json(await voucherDetailRoute.DELETE(makeReq(`/api/vouchers/${v.id}`, { method: 'DELETE', session: adminSess() }), { params: Promise.resolve({ id: v.id }) }))
    expect(first.status).toBe(200)
    const second = await json(await voucherDetailRoute.DELETE(makeReq(`/api/vouchers/${v.id}`, { method: 'DELETE', session: adminSess() }), { params: Promise.resolve({ id: v.id }) }))
    expect(second.status).toBe(404)
    expect(Number((await db.invoice.findUnique({ where: { id: inv.id } }))?.paidAmount)).toBe(0)
  })
})

// ─────────── R2-L04: warehouse delete race (RESTRICT FKs) ───────────

describe('R2-L04 — warehouse delete race hardening', () => {
  test('route refuses delete when a transfer references the warehouse (409 in-use)', async () => {
    const wh = await db.warehouse.create({ data: { orgId: orgG.id, name: 'R2-WH-TR', isDefault: false } })
    const other = await db.warehouse.create({ data: { orgId: orgG.id, name: 'R2-WH-TR2', isDefault: false } })
    await db.transfer.create({ data: { orgId: orgG.id, number: 1, fromWarehouseId: wh.id, toWarehouseId: other.id } })
    const res = await json(await (async () => {
      const mod = await import('@/app/api/warehouses/[id]/route')
      return mod.DELETE(makeReq(`/api/warehouses/${wh.id}`, { method: 'DELETE', session: adminSess() }), { params: Promise.resolve({ id: wh.id }) })
    })())
    expect(res.status).toBe(409)
    expect(res.json.error).toBe('in-use')
    // DB-level RESTRICT is the source of truth — even a raw delete fails
    let fkThrew = false
    try {
      await db.warehouse.delete({ where: { id: wh.id } })
    } catch (e) {
      fkThrew = String((e as { code?: string })?.code) === 'P2003'
    }
    expect(fkThrew).toBe(true)
  })

  test('an unreferenced non-default warehouse deletes fine', async () => {
    const wh = await db.warehouse.create({ data: { orgId: orgG.id, name: 'R2-WH-FREE', isDefault: false } })
    const mod = await import('@/app/api/warehouses/[id]/route')
    const res = await json(await mod.DELETE(makeReq(`/api/warehouses/${wh.id}`, { method: 'DELETE', session: adminSess() }), { params: Promise.resolve({ id: wh.id }) }))
    expect(res.status).toBe(200)
  })
})

// ─────────── R2-L05: products openingQty loud validation ───────────

describe('R2-L05 — openingQty silent-skip hardening', () => {
  test('unknown warehouse in openingQty → 400 opening-warehouse-not-found, product NOT created', async () => {
    const res = await json(await productsRoute.POST(makeReq('/api/products', {
      method: 'POST', session: adminSess(),
      body: { name: 'Ghost Prod', cost: 1, price: 2, openingQty: [{ warehouseId: 'no-such-warehouse', qty: 5 }] },
    })))
    expect(res.status).toBe(400)
    expect(res.json.error).toBe('opening-warehouse-not-found')
    expect(await db.product.count({ where: { orgId: orgG.id, name: 'Ghost Prod' } })).toBe(0)
  })

  test('non-positive opening qty → 400 invalid-opening-qty, product NOT created', async () => {
    const wh = await db.warehouse.create({ data: { orgId: orgG.id, name: 'R2-WH-OP', isDefault: false } })
    const res = await json(await productsRoute.POST(makeReq('/api/products', {
      method: 'POST', session: adminSess(),
      body: { name: 'Zero Prod', cost: 1, price: 2, openingQty: [{ warehouseId: wh.id, qty: 0 }] },
    })))
    expect(res.status).toBe(400)
    expect(res.json.error).toBe('invalid-opening-qty')
    expect(await db.product.count({ where: { orgId: orgG.id, name: 'Zero Prod' } })).toBe(0)
  })

  test('valid openings still create product + stockLevel + OPENING movement', async () => {
    const wh = await db.warehouse.findFirst({ where: { orgId: orgG.id, name: 'R2-WH-OP' } })
    const res = await json(await productsRoute.POST(makeReq('/api/products', {
      method: 'POST', session: adminSess(),
      body: { name: 'Open Prod', cost: 1, price: 2, openingQty: [{ warehouseId: wh!.id, qty: 12.5 }] },
    })))
    expect(res.status).toBe(200)
    const prod = await db.product.findFirst({ where: { orgId: orgG.id, name: 'Open Prod' } })
    expect(prod).toBeTruthy()
    const level = await db.stockLevel.findUnique({ where: { productId_warehouseId: { productId: prod!.id, warehouseId: wh!.id } } })
    expect(Number(level?.qty)).toBe(12.5)
    const mov = await db.stockMovement.findFirst({ where: { orgId: orgG.id, productId: prod!.id, kind: 'OPENING' } })
    expect(Number(mov?.qty)).toBe(12.5)
  })
})

// ─────────── R2-L01: login timing oracle (disabled accounts) ───────────

describe('R2-L01 — disabled account login behavior', () => {
  test('disabled account with CORRECT password → 401 (and KDF burned, code-reviewed)', async () => {
    const u = await db.user.create({
      data: { orgId: orgG.id, email: 'disabled@r2.test', name: 'Disabled', passwordHash: auth.hashPassword('right-pass-9'), role: 'CASHIER', active: false },
    })
    const res = await json(await loginRoute.POST(makeReq('/api/auth/login', {
      method: 'POST', body: { email: 'disabled@r2.test', password: 'right-pass-9' },
    })))
    expect(res.status).toBe(401)
    await db.user.update({ where: { id: u.id }, data: { active: true } })
    const res2 = await json(await loginRoute.POST(makeReq('/api/auth/login', {
      method: 'POST', body: { email: 'disabled@r2.test', password: 'right-pass-9' },
    })))
    expect(res2.status).toBe(200)
  })

  test('disabled account with WRONG password → 401', async () => {
    const res = await json(await loginRoute.POST(makeReq('/api/auth/login', {
      method: 'POST', body: { email: 'disabled@r2.test', password: 'wrong-pass-1' },
    })))
    expect(res.status).toBe(401)
  })
})

// ─────────── R2-L02: users duplicate email via unique constraint ───────────

describe('R2-L02 — POST /api/users duplicate email', () => {
  test('duplicate email → 400 email-taken (DB constraint path, no pre-check)', async () => {
    const res = await json(await usersRoute.POST(makeReq('/api/users', {
      method: 'POST', session: adminSess(),
      body: { name: 'Dup User', email: 'admin@r2.test', password: 'secret-123' },
    })))
    expect(res.status).toBe(400)
    expect(res.json.error).toBe('email-taken')
  })

  test('fresh email still creates', async () => {
    const res = await json(await usersRoute.POST(makeReq('/api/users', {
      method: 'POST', session: adminSess(),
      body: { name: 'New User', email: 'new@r2.test', password: 'secret-123', role: 'CASHIER' },
    })))
    expect(res.status).toBe(200)
  })
})

// ─────────── R2-HIGH: logo stored-XSS policy ───────────

describe('R2-HIGH — logo attribute-breakout payloads rejected at write time', () => {
  test('settings/org PUT rejects `data:image/png,1" onerror=...` breakout payload', async () => {
    const res = await json(await orgSettingsRoute.PUT(makeReq('/api/settings/org', {
      method: 'PUT', session: adminSess(),
      body: { logo: 'data:image/png,1" onerror="alert(document.cookie)" x="' },
    })))
    expect(res.status).toBe(400)
    expect(res.json.error).toBe('invalid-logo')
  })

  test('settings/org PUT rejects svg+xml (executable markup)', async () => {
    const res = await json(await orgSettingsRoute.PUT(makeReq('/api/settings/org', {
      method: 'PUT', session: adminSess(),
      body: { logo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
    })))
    expect(res.status).toBe(400)
    expect(res.json.error).toBe('invalid-logo')
  })

  test('valid raster base64 PNG logo is accepted and stored', async () => {
    // 1x1 transparent PNG
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const res = await json(await orgSettingsRoute.PUT(makeReq('/api/settings/org', {
      method: 'PUT', session: adminSess(),
      body: { logo: `data:image/png;base64,${png}` },
    })))
    expect(res.status).toBe(200)
    expect(res.json.data.logo).toContain(png)
  })
})
