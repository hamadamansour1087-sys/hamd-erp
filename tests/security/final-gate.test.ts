/**
 * FINAL PRODUCTION GATE — regression suite (bun:test).
 *
 * Verifies the P0 fixes at the code level (code is the source of truth):
 *  - P0-01/02: CASHIER cannot set a non-zero openingBalance on POST
 *    /api/customers or /api/suppliers (ADMIN/MANAGER can; zero stays allowed
 *    for the POS quick-create flow)
 *  - P0-03: CASHIER cannot create warehouses (403)
 *  - P0-04: CASHIER cannot create categories/units (403); MANAGER can
 *  - P0-05: customer/supplier profile `owed` is a FULL-SET computation equal,
 *    by construction, to partyDues() (reports/dashboard) — proven with 100+
 *    invoices where the OLDEST ones carry the dues (old take:50 bug)
 *  - P0-06: concurrent stock adjustments cannot lose updates — final
 *    StockLevel.qty always matches initial + sum(StockMovement deltas)
 *  - P0-07: idempotency crash window — a retry after a simulated post-COMMIT
 *    crash (claim recorded, resultId missing, document committed) returns the
 *    committed document and never creates a second one
 *
 * Run: bun test tests/security
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { execSync } from 'node:child_process'
import path from 'node:path'

const TEST_DB = path.resolve('db/test-gate.db') // own file: bun runs test files in parallel

process.env.DATABASE_URL = `file:${TEST_DB}`
process.env.AUTH_SECRET = 'test-secret-value-at-least-16-chars-long'
process.env.NODE_ENV = 'test'

// Dynamic imports AFTER env is set (PrismaClient reads DATABASE_URL at import time)
const { db } = await import('@/lib/db')
const auth = await import('@/lib/auth')
const invoicesRoute = await import('@/app/api/invoices/route')
const vouchersRoute = await import('@/app/api/vouchers/route')
const customersRoute = await import('@/app/api/customers/route')
const customerProfileRoute = await import('@/app/api/customers/[id]/route')
const suppliersRoute = await import('@/app/api/suppliers/route')
const supplierProfileRoute = await import('@/app/api/suppliers/[id]/route')
const warehousesRoute = await import('@/app/api/warehouses/route')
const categoriesRoute = await import('@/app/api/categories/route')
const unitsRoute = await import('@/app/api/units/route')
const adjustRoute = await import('@/app/api/stock/adjust/route')
const reportsUtils = await import('@/lib/reports-utils')

const { NextRequest } = await import('next/server')

// In-process serialization for stock adjustments: SQLite single-writer means
// concurrent interactive transactions contend on the write lock; the keyed
// mutex removes that contention in the single-process deployment while the
// CAS loop inside stays as the correctness backstop.
const locks = new Map<string, Promise<unknown>>()
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  const next = prev.catch(() => undefined).then(fn)
  locks.set(key, next)
  try {
    return await next
  } finally {
    if (locks.get(key) === next) locks.delete(key)
  }
}

type Sess = { id: string; orgId: string; role: string; tokenVersion?: number }

let orgG: { id: string }
let adminG: { id: string; tokenVersion: number }
let managerG: { id: string; tokenVersion: number }
let cashierG: { id: string; tokenVersion: number }
let whG: { id: string }
let productG: { id: string }

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
const managerSess = () => ({ id: managerG.id, orgId: orgG.id, role: 'MANAGER' }) as Sess
const cashierSess = () => ({ id: cashierG.id, orgId: orgG.id, role: 'CASHIER' }) as Sess

beforeAll(async () => {
  // disposable test database — rebuilt from scratch so the schema always matches
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try { await import('node:fs').then((fs) => fs.unlinkSync(TEST_DB + suffix)) } catch { /* not present */ }
  }
  execSync(`bunx prisma db push --skip-generate`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
    stdio: 'pipe',
  })
  // wipe + seed (only the gate tables; other suites share the db file)
  await db.idempotencyKey.deleteMany()
  await db.voucher.deleteMany()
  await db.invoiceItem.deleteMany()
  await db.invoice.deleteMany()
  await db.stockMovement.deleteMany()
  await db.stockLevel.deleteMany()
  await db.transfer.deleteMany()
  await db.expense.deleteMany()
  await db.product.deleteMany()
  await db.customer.deleteMany()
  await db.supplier.deleteMany()
  await db.warehouse.deleteMany()
  await db.counter.deleteMany()
  await db.category.deleteMany()
  await db.unit.deleteMany()

  orgG = await db.org.create({ data: { name: 'Gate Org' } })
  const pw = auth.hashPassword('gate-pass-123')
  adminG = await db.user.create({
    data: { orgId: orgG.id, email: 'admin@gate.test', name: 'Gate Admin', passwordHash: pw, role: 'ADMIN' },
  })
  managerG = await db.user.create({
    data: { orgId: orgG.id, email: 'mgr@gate.test', name: 'Gate Mgr', passwordHash: pw, role: 'MANAGER' },
  })
  cashierG = await db.user.create({
    data: { orgId: orgG.id, email: 'cashier@gate.test', name: 'Gate Cashier', passwordHash: pw, role: 'CASHIER' },
  })
  whG = await db.warehouse.create({ data: { orgId: orgG.id, name: 'Gate-WH', isDefault: true } })
  productG = await db.product.create({ data: { orgId: orgG.id, name: 'Gate Prod', price: 100, cost: 40, trackStock: true } })
})

afterAll(async () => {
  await db.$disconnect()
})

// ─────────── P0-01: customer openingBalance authorization ───────────

describe('P0-01 — POST /api/customers openingBalance authorization', () => {
  test('CASHIER with non-zero openingBalance → 403, nothing created', async () => {
    const res = await customersRoute.POST(makeReq('/api/customers', {
      method: 'POST', session: cashierSess(),
      body: { name: 'Evil Cust', openingBalance: 5000 },
    }))
    expect(res.status).toBe(403)
    expect(await db.customer.count({ where: { orgId: orgG.id, name: 'Evil Cust' } })).toBe(0)
  })

  test('CASHIER with openingBalance=0 → allowed (POS quick-create flow)', async () => {
    const res = await json(await customersRoute.POST(makeReq('/api/customers', {
      method: 'POST', session: cashierSess(),
      body: { name: 'POS Cust', openingBalance: 0 },
    })))
    expect(res.status).toBe(200)
    expect(res.json.data.openingBalance).toBe(0)
  })

  test('CASHIER omitting openingBalance → allowed', async () => {
    const res = await json(await customersRoute.POST(makeReq('/api/customers', {
      method: 'POST', session: cashierSess(), body: { name: 'Plain Cust' },
    })))
    expect(res.status).toBe(200)
  })

  test('ADMIN and MANAGER can set non-zero openingBalance', async () => {
    const r1 = await json(await customersRoute.POST(makeReq('/api/customers', {
      method: 'POST', session: adminSess(), body: { name: 'Admin Cust', openingBalance: 750.25 },
    })))
    expect(r1.status).toBe(200)
    expect(r1.json.data.openingBalance).toBe(750.25)
    const r2 = await json(await customersRoute.POST(makeReq('/api/customers', {
      method: 'POST', session: managerSess(), body: { name: 'Mgr Cust', openingBalance: -300 },
    })))
    expect(r2.status).toBe(200)
    expect(r2.json.data.openingBalance).toBe(-300)
  })
})

// ─────────── P0-02: supplier openingBalance authorization ───────────

describe('P0-02 — POST /api/suppliers openingBalance authorization', () => {
  test('CASHIER with non-zero openingBalance → 403, nothing created', async () => {
    const res = await suppliersRoute.POST(makeReq('/api/suppliers', {
      method: 'POST', session: cashierSess(),
      body: { name: 'Evil Sup', openingBalance: 9000 },
    }))
    expect(res.status).toBe(403)
    expect(await db.supplier.count({ where: { orgId: orgG.id, name: 'Evil Sup' } })).toBe(0)
  })

  test('CASHIER with zero/absent openingBalance → allowed', async () => {
    const r1 = await suppliersRoute.POST(makeReq('/api/suppliers', {
      method: 'POST', session: cashierSess(), body: { name: 'POS Sup', openingBalance: 0 },
    }))
    expect(r1.status).toBe(200)
    const r2 = await suppliersRoute.POST(makeReq('/api/suppliers', {
      method: 'POST', session: cashierSess(), body: { name: 'Plain Sup' },
    }))
    expect(r2.status).toBe(200)
  })

  test('ADMIN can set non-zero openingBalance', async () => {
    const res = await json(await suppliersRoute.POST(makeReq('/api/suppliers', {
      method: 'POST', session: adminSess(), body: { name: 'Admin Sup', openingBalance: 1200 },
    })))
    expect(res.status).toBe(200)
    expect(res.json.data.openingBalance).toBe(1200)
  })
})

// ─────────── P0-03: warehouse creation authorization ───────────

describe('P0-03 — POST /api/warehouses authorization', () => {
  test('CASHIER → 403, nothing created', async () => {
    const res = await warehousesRoute.POST(makeReq('/api/warehouses', {
      method: 'POST', session: cashierSess(), body: { name: 'Cashier WH' },
    }))
    expect(res.status).toBe(403)
    expect(await db.warehouse.count({ where: { orgId: orgG.id, name: 'Cashier WH' } })).toBe(0)
  })

  test('ADMIN and MANAGER → allowed', async () => {
    expect((await warehousesRoute.POST(makeReq('/api/warehouses', {
      method: 'POST', session: adminSess(), body: { name: 'Admin WH' },
    }))).status).toBe(200)
    expect((await warehousesRoute.POST(makeReq('/api/warehouses', {
      method: 'POST', session: managerSess(), body: { name: 'Mgr WH' },
    }))).status).toBe(200)
  })
})

// ─────────── P0-04: categories & units authorization ───────────

describe('P0-04 — POST /api/categories and /api/units authorization', () => {
  test('CASHIER category create → 403', async () => {
    const res = await categoriesRoute.POST(makeReq('/api/categories', {
      method: 'POST', session: cashierSess(), body: { name: 'Cashier Cat' },
    }))
    expect(res.status).toBe(403)
    expect(await db.category.count({ where: { orgId: orgG.id, name: 'Cashier Cat' } })).toBe(0)
  })

  test('CASHIER unit create → 403', async () => {
    const res = await unitsRoute.POST(makeReq('/api/units', {
      method: 'POST', session: cashierSess(), body: { name: 'Cashier Unit' },
    }))
    expect(res.status).toBe(403)
    expect(await db.unit.count({ where: { orgId: orgG.id, name: 'Cashier Unit' } })).toBe(0)
  })

  test('MANAGER category + unit create → allowed', async () => {
    expect((await categoriesRoute.POST(makeReq('/api/categories', {
      method: 'POST', session: managerSess(), body: { name: 'Mgr Cat' },
    }))).status).toBe(200)
    expect((await unitsRoute.POST(makeReq('/api/units', {
      method: 'POST', session: managerSess(), body: { name: 'Mgr Unit' },
    }))).status).toBe(200)
  })
})

// ─────────── P0-05: full-set party balance (100+ invoices) ───────────

describe('P0-05 — profile balance over FULL document set (100+ invoices)', () => {
  test('dues living in the OLDEST invoices are counted; profile == partyDues == reports', async () => {
    const cust = await db.customer.create({ data: { orgId: orgG.id, name: 'Bulk Cust', openingBalance: 100 } })

    // 120 invoices, numbers 1000+ (clear of the INV counter range). The 30
    // OLDEST carry unpaid dues (total 1000, paid 200 → 800 due each);
    // the 90 NEWEST are fully paid. take:50 (newest-first) would only ever see paid ones.
    let n = 1000
    for (let i = 0; i < 120; i++) {
      n++
      const old = i < 30
      // make the old ones genuinely OLDER by createdAt ordering (date field)
      const date = new Date(Date.now() - (120 - i) * 60_000)
      await db.invoice.create({
        data: {
          orgId: orgG.id,
          number: n,
          type: 'SALE',
          status: old ? 'PARTIAL' : 'PAID',
          customerId: cust.id,
          warehouseId: whG.id,
          date,
          subtotal: 1000,
          total: 1000,
          paidAmount: old ? 200 : 1000,
        },
      })
    }
    expect(n).toBe(1120)
    // one standalone receipt of 400 (party credit) — number clear of the RCV counter
    await db.voucher.create({
      data: { orgId: orgG.id, number: 8000, type: 'RECEIPT', amount: 400, partyType: 'CUSTOMER', customerId: cust.id, partyName: 'Bulk Cust' },
    })

    // expected: 100 (opening) + 30 × 800 (dues) − 400 (receipt) = 24100
    const expectedOwed = 100 + 30 * 800 - 400

    const profile = await json(await customerProfileRoute.GET(
      makeReq(`/api/customers/${cust.id}`, { session: adminSess() }),
      { params: Promise.resolve({ id: cust.id }) }
    ))
    expect(profile.status).toBe(200)
    expect(profile.json.data.owed).toBe(expectedOwed)
    // history stays capped (presentation only) but the balance is full-set
    expect(profile.json.data.invoices.length).toBeLessThanOrEqual(50)

    // must be IDENTICAL to the reports/dashboard aggregation
    const dues = await reportsUtils.partyDues(orgG.id)
    const row = dues.customerRows.find((c) => c.id === cust.id)
    expect(row?.owed).toBe(expectedOwed)

    // and identical to the shared helper used by both
    const single = await reportsUtils.singlePartyDues(orgG.id, 'customer', cust.id)
    expect(single.owed).toBe(expectedOwed)
  })

  test('supplier profile balance also matches partyDues over the full set', async () => {
    const sup = await db.supplier.create({ data: { orgId: orgG.id, name: 'Bulk Sup', openingBalance: 50 } })
    // 60 PURCHASEs, numbers 2000+ (clear of the PUR counter), the 10 oldest partially paid (300 due each)
    for (let i = 0; i < 60; i++) {
      const old = i < 10
      await db.invoice.create({
        data: {
          orgId: orgG.id,
          number: 2000 + i,
          type: 'PURCHASE',
          status: old ? 'PARTIAL' : 'PAID',
          supplierId: sup.id,
          warehouseId: whG.id,
          date: new Date(Date.now() - (60 - i) * 60_000),
          subtotal: 1000,
          total: 1000,
          paidAmount: old ? 700 : 1000,
        },
      })
    }
    const expected = 50 + 10 * 300
    const profile = await json(await supplierProfileRoute.GET(
      makeReq(`/api/suppliers/${sup.id}`, { session: adminSess() }),
      { params: Promise.resolve({ id: sup.id }) }
    ))
    expect(profile.status).toBe(200)
    expect(profile.json.data.owed).toBe(expected)
    const dues = await reportsUtils.partyDues(orgG.id)
    const row = dues.supplierRows.find((s) => s.id === sup.id)
    expect(row?.owed).toBe(expected)
  })

  test('cancelled-invoice receipts count as credit in the profile exactly like partyDues', async () => {
    const cust = await db.customer.create({ data: { orgId: orgG.id, name: 'Cancel Cust', openingBalance: 0 } })
    const inv = await db.invoice.create({
      data: {
        orgId: orgG.id, number: 9001, type: 'SALE', status: 'CANCELLED',
        customerId: cust.id, warehouseId: whG.id, subtotal: 500, total: 500, paidAmount: 500,
      },
    })
    // receipt linked to the CANCELLED invoice → party credit per business rule #3
    await db.voucher.create({
      data: { orgId: orgG.id, number: 9001, type: 'RECEIPT', amount: 500, partyType: 'CUSTOMER', customerId: cust.id, invoiceId: inv.id, partyName: 'Cancel Cust' },
    })
    const profile = await json(await customerProfileRoute.GET(
      makeReq(`/api/customers/${cust.id}`, { session: adminSess() }),
      { params: Promise.resolve({ id: cust.id }) }
    ))
    const dues = await reportsUtils.partyDues(orgG.id)
    const row = dues.customerRows.find((c) => c.id === cust.id)
    expect(profile.json.data.owed).toBe(row?.owed)
    expect(profile.json.data.owed).toBe(-500) // credit, not +500 phantom dues
  })
})

// ─────────── P0-06: stock adjustment concurrency (CAS) ───────────

describe('P0-06 — concurrent stock adjustments (no lost update)', () => {
  test('two parallel absolute adjustments leave qty == ledger sum', async () => {
    // start at 100
    await db.stockLevel.create({ data: { productId: productG.id, warehouseId: whG.id, qty: 100 } })
    await db.stockMovement.create({
      data: { orgId: orgG.id, productId: productG.id, warehouseId: whG.id, qty: 100, kind: 'OPENING', refType: 'OPENING' },
    })

    // mirror the route's own concurrency primitive (route uses withLock internally,
    // so here we exercise the same in-process serialization)
    void withLock
    const [a, b] = await Promise.all([
      adjustRoute.POST(makeReq('/api/stock/adjust', {
        method: 'POST', session: adminSess(),
        body: { warehouseId: whG.id, productId: productG.id, newQty: 80, reason: 'count A' },
      })),
      adjustRoute.POST(makeReq('/api/stock/adjust', {
        method: 'POST', session: managerSess(),
        body: { warehouseId: whG.id, productId: productG.id, newQty: 150, reason: 'count B' },
      })),
    ])
    // both requests succeed (or the loser of a conflict retries internally)
    expect([200, 409]).toContain(a.status)
    expect([200, 409]).toContain(b.status)
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)

    const level = await db.stockLevel.findUnique({
      where: { productId_warehouseId: { productId: productG.id, warehouseId: whG.id } },
    })
    const movements = await db.stockMovement.findMany({
      where: { productId: productG.id, warehouseId: whG.id, kind: { startsWith: 'ADJUST' } },
    })
    const ledgerSum = movements.reduce((s, m) => s + m.qty, 0)

    // final qty is one of the two requested absolute values (CAS serialized them)
    expect([80, 150]).toContain(level?.qty)
    // INVARIANT: StockLevel.qty === initial + Σ(ledger deltas) — never diverges
    expect(level!.qty).toBe(100 + ledgerSum)
  })

  test('three parallel adjustments to the SAME value create exactly one movement', async () => {
    await adjustRoute.POST(makeReq('/api/stock/adjust', {
      method: 'POST', session: adminSess(),
      body: { warehouseId: whG.id, productId: productG.id, newQty: 200 },
    }))
    const before = await db.stockMovement.count({
      where: { productId: productG.id, warehouseId: whG.id, kind: { startsWith: 'ADJUST' } },
    })
    await Promise.all([
      adjustRoute.POST(makeReq('/api/stock/adjust', { method: 'POST', session: adminSess(), body: { warehouseId: whG.id, productId: productG.id, newQty: 555 } })),
      adjustRoute.POST(makeReq('/api/stock/adjust', { method: 'POST', session: managerSess(), body: { warehouseId: whG.id, productId: productG.id, newQty: 555 } })),
      adjustRoute.POST(makeReq('/api/stock/adjust', { method: 'POST', session: adminSess(), body: { warehouseId: whG.id, productId: productG.id, newQty: 555 } })),
    ])
    const level = await db.stockLevel.findUnique({
      where: { productId_warehouseId: { productId: productG.id, warehouseId: whG.id } },
    })
    expect(level?.qty).toBe(555)
    const movements = await db.stockMovement.findMany({
      where: { productId: productG.id, warehouseId: whG.id, kind: { startsWith: 'ADJUST' } },
    })
    // only ONE of the three identical adjustments may have produced a ledger delta
    const deltaSum = movements.reduce((s, m) => s + m.qty, 0)
    const adjustMovsAfterSecondWave = movements.length - before
    // exactly one new movement (delta 555-200=+355); the other two saw delta 0
    expect(adjustMovsAfterSecondWave).toBe(1)
    // full ledger invariant: OPENING(+100) + all adjustment deltas === qty
    expect(100 + deltaSum).toBe(555)
  })
})

// ─────────── P0-07: idempotency crash window ───────────

describe('P0-07 — idempotency survives a post-COMMIT crash', () => {
  test('retry after simulated crash (committed doc, claim without resultId) → SAME doc, no duplicate', async () => {
    const key = 'crash-window-invoice-1'
    const scoped = `invoice:${key}`

    // 1) first attempt: create the invoice normally (with a claim we will "damage")
    const r1 = await json(await invoicesRoute.POST(makeReq('/api/invoices', {
      method: 'POST', session: adminSess(),
      headers: { 'Idempotency-Key': key },
      body: { type: 'SALE', taxPercent: 0, paidAmount: 0, items: [{ productId: productG.id, qty: 1, price: 100 }] },
    })))
    expect(r1.status).toBe(200)
    const firstId = r1.json.data.id
    expect(r1.json.data.duplicate).toBe(false)

    // 2) SIMULATE THE CRASH WINDOW: the invoice committed, but the server died
    //    before writing resultId onto the claim (and the client never got the response).
    await db.idempotencyKey.updateMany({
      where: { orgId: orgG.id, key: scoped },
      data: { resultId: null },
    })
    // sanity: the committed invoice carries the clientOperationId anchor
    const committed = await db.invoice.findUnique({ where: { id: firstId } })
    expect(committed?.clientOperationId).toBe(scoped)

    // 3) the client retries the exact same request
    const r2 = await json(await invoicesRoute.POST(makeReq('/api/invoices', {
      method: 'POST', session: adminSess(),
      headers: { 'Idempotency-Key': key },
      body: { type: 'SALE', taxPercent: 0, paidAmount: 0, items: [{ productId: productG.id, qty: 1, price: 100 }] },
    })))
    expect(r2.status).toBe(200)
    expect(r2.json.data.duplicate).toBe(true)
    expect(r2.json.data.id).toBe(firstId)

    // 4) the database must contain exactly ONE such invoice
    const sameOp = await db.invoice.findMany({ where: { orgId: orgG.id, clientOperationId: scoped } })
    expect(sameOp.length).toBe(1)
  })

  test('retry after crash BEFORE commit (claim only) → creates exactly one document', async () => {
    const key = 'crash-window-voucher-1'
    const scoped = `voucher:${key}`
    // claim recorded, then the process died before the transaction committed
    await db.idempotencyKey.create({ data: { orgId: orgG.id, userId: adminG.id, key: scoped } })

    const r1 = await json(await vouchersRoute.POST(makeReq('/api/vouchers', {
      method: 'POST', session: adminSess(),
      headers: { 'Idempotency-Key': key },
      body: { type: 'RECEIPT', amount: 300, customerId: null },
    })))
    expect(r1.status).toBe(200)
    const vid = r1.json.data.id
    // exactly one voucher exists for this operation
    expect(await db.voucher.count({ where: { orgId: orgG.id, clientOperationId: scoped } })).toBe(1)

    // a further replay resolves through the claim's backfilled resultId
    const r2 = await json(await vouchersRoute.POST(makeReq('/api/vouchers', {
      method: 'POST', session: adminSess(),
      headers: { 'Idempotency-Key': key },
      body: { type: 'RECEIPT', amount: 300, customerId: null },
    })))
    expect(r2.status).toBe(200)
    expect(r2.json.data.duplicate).toBe(true)
    expect(r2.json.data.id).toBe(vid)
    expect(await db.voucher.count({ where: { orgId: orgG.id, clientOperationId: scoped } })).toBe(1)
    void scoped
  })

  test('voucher replay with same key never double-applies paidAmount (crash + CAS combined)', async () => {
    const cust = await db.customer.create({ data: { orgId: orgG.id, name: 'Crash Pay Cust' } })
    const inv = await json(await invoicesRoute.POST(makeReq('/api/invoices', {
      method: 'POST', session: adminSess(),
      body: { type: 'SALE', customerId: cust.id, taxPercent: 0, paidAmount: 0, items: [{ productId: productG.id, qty: 10, price: 100 }] },
    })))
    const invoiceId = inv.json.data.id

    const key = 'crash-window-pay-1'
    const r1 = await json(await vouchersRoute.POST(makeReq('/api/vouchers', {
      method: 'POST', session: adminSess(),
      headers: { 'Idempotency-Key': key },
      body: { type: 'RECEIPT', amount: 250, invoiceId },
    })))
    expect(r1.status).toBe(200)
    // crash window simulation: resultId lost
    await db.idempotencyKey.updateMany({
      where: { orgId: orgG.id, key: `voucher:${key}` },
      data: { resultId: null },
    })
    const r2 = await json(await vouchersRoute.POST(makeReq('/api/vouchers', {
      method: 'POST', session: adminSess(),
      headers: { 'Idempotency-Key': key },
      body: { type: 'RECEIPT', amount: 250, invoiceId },
    })))
    expect(r2.status).toBe(200)
    expect(r2.json.data.id).toBe(r1.json.data.id)

    const fresh = await db.invoice.findUnique({ where: { id: invoiceId } })
    // 250 applied ONCE — the retry did not pay again
    expect(fresh?.paidAmount).toBe(250)
    expect(await db.voucher.count({ where: { invoiceId } })).toBe(1)
  })
})

// ─────────── regression: counter numbers stay unique under CAS invoice retries ───────────

describe('Gate sanity — invoices still number uniquely after gate changes', () => {
  test('two invoices created without keys get distinct sequential numbers', async () => {
    const a = await json(await invoicesRoute.POST(makeReq('/api/invoices', {
      method: 'POST', session: adminSess(),
      body: { type: 'SALE', taxPercent: 0, items: [{ productId: productG.id, qty: 1, price: 10 }] },
    })))
    const b = await json(await invoicesRoute.POST(makeReq('/api/invoices', {
      method: 'POST', session: adminSess(),
      body: { type: 'SALE', taxPercent: 0, items: [{ productId: productG.id, qty: 1, price: 10 }] },
    })))
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(a.json.data.invoice.number).not.toBe(b.json.data.invoice.number)
  })
})
