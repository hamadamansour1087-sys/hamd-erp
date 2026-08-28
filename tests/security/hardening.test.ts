/**
 * SECURITY HARDENING REGRESSIONS — fixes from the senior security review.
 * Own disposable DB (bun runs test files in parallel).
 *
 * Covers:
 *  - H1  voucher overpayment → 409, paidAmount untouched
 *  - H2  voucher with cross-org customerId → 400
 *  - H3  product with cross-org categoryId → 400
 *  - H4  duplicate barcode same org → 400 (UNIQUE(orgId, barcode))
 *  - H5  concurrent duplicate-email invites → exactly one succeeds, other 400
 *  - H6  invalid email shape → 400
 *  - H7  last-admin race (Promise.all mutual demotion) → ≥1 active admin survives
 *  - H8  allowNegativeStock: MANAGER → 403, ADMIN → 200
 *  - H9  logo: SVG data URL → 400, PNG data URL → 200
 *  - H10 openingQty > 50 → 400
 *  - H11 invoice item qty 1e12 → 400
 *  - H12 voucher date year-9999 → clamped into [2000, 2100]
 *  - H13 product still holding stock → soft-delete (deactivated), never raw FK 500
 *  - H14 search q > 100 chars → truncated (capped pattern still matches), no 500
 *  - H15 login brute-force ledger (DB-backed, fail-only): 11th fail → 429,
 *       correct password never locked out, failures recorded in LoginAttempt
 */
import { execSync } from 'node:child_process'
import path from 'node:path'

const TEST_DB = path.resolve('db/test-hardening.db')

process.env.DATABASE_URL = `file:${TEST_DB}`
process.env.AUTH_SECRET = 'test-secret-value-at-least-16-chars-long'
process.env.NODE_ENV = 'test'

// Dynamic imports AFTER env is set (PrismaClient reads DATABASE_URL at import time)
const { db } = await import('@/lib/db')
const auth = await import('@/lib/auth')
const vouchersRoute = await import('@/app/api/vouchers/route')
const productsRoute = await import('@/app/api/products/route')
const productDetailRoute = await import('@/app/api/products/[id]/route')
const invoicesRoute = await import('@/app/api/invoices/route')
const usersRoute = await import('@/app/api/users/route')
const userIdRoute = await import('@/app/api/users/[id]/route')
const settingsOrgRoute = await import('@/app/api/settings/org/route')
const loginRoute = await import('@/app/api/auth/login/route')

const { NextRequest } = await import('next/server')

type Sess = { id: string; orgId: string; role: string; tokenVersion?: number }

let orgA: { id: string }
let orgB: { id: string }
let adminA: { id: string }
let admin2A: { id: string }
let managerA: { id: string }
let adminB: { id: string }
let whA: { id: string }
let prodA: { id: string }

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

const adminSess = () => ({ id: adminA.id, orgId: orgA.id, role: 'ADMIN' }) as Sess
const admin2Sess = () => ({ id: admin2A.id, orgId: orgA.id, role: 'ADMIN' }) as Sess
const managerSess = () => ({ id: managerA.id, orgId: orgA.id, role: 'MANAGER' }) as Sess
const adminBSess = () => ({ id: adminB.id, orgId: orgB.id, role: 'ADMIN' }) as Sess

beforeAll(async () => {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try { await import('node:fs').then((fs) => fs.unlinkSync(TEST_DB + suffix)) } catch { /* not present */ }
  }
  execSync(`bunx prisma db push --skip-generate`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
    stdio: 'pipe',
  })
  await db.idempotencyKey.deleteMany()
  await db.loginAttempt.deleteMany()
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
  await db.user.deleteMany()
  await db.org.deleteMany()

  orgA = await db.org.create({ data: { name: 'Hardening A', taxPercent: 0 } })
  orgB = await db.org.create({ data: { name: 'Hardening B', taxPercent: 0 } })
  const pw = auth.hashPassword('hardening-pass-123')
  adminA = await db.user.create({
    data: { orgId: orgA.id, email: 'admin-a@hard.test', name: 'Admin A', passwordHash: pw, role: 'ADMIN' },
  })
  admin2A = await db.user.create({
    data: { orgId: orgA.id, email: 'admin-a2@hard.test', name: 'Admin A2', passwordHash: pw, role: 'ADMIN' },
  })
  managerA = await db.user.create({
    data: { orgId: orgA.id, email: 'mgr-a@hard.test', name: 'Mgr A', passwordHash: pw, role: 'MANAGER' },
  })
  adminB = await db.user.create({
    data: { orgId: orgB.id, email: 'admin-b@hard.test', name: 'Admin B', passwordHash: pw, role: 'ADMIN' },
  })
  whA = await db.warehouse.create({ data: { orgId: orgA.id, name: 'Hard-WH', isDefault: true } })
  prodA = await db.product.create({
    data: { orgId: orgA.id, name: 'Hard Prod', price: 100, cost: 40, trackStock: true },
  })
  await db.stockLevel.create({ data: { productId: prodA.id, warehouseId: whA.id, qty: 500 } })
})

afterAll(async () => {
  await db.$disconnect()
})

// ─────────── H1: overpayment rejected, paidAmount untouched ───────────
test('H1. voucher overpaying an invoice → 409 amount-exceeds-due; exact pay → PAID', async () => {
  const inv = await json(
    await invoicesRoute.POST(
      makeReq('/api/invoices', {
        method: 'POST',
        session: adminSess(),
        body: { type: 'SALE', warehouseId: whA.id, items: [{ productId: prodA.id, qty: 2 }] },
      })
    )
  )
  expect(inv.status).toBe(200)
  // NOTE: the invoice response body IS the invoice (data.id / data.total)
  const invoiceId = inv.json.data.id as string
  const total = inv.json.data.total as number
  expect(total).toBe(200)

  const over = await json(
    await vouchersRoute.POST(
      makeReq('/api/vouchers', {
        method: 'POST',
        session: adminSess(),
        body: { type: 'RECEIPT', amount: total + 50, invoiceId },
      })
    )
  )
  expect(over.status).toBe(409)
  expect(over.json.error).toBe('amount-exceeds-due')

  const after = await db.invoice.findUnique({ where: { id: invoiceId }, select: { paidAmount: true, status: true } })
  expect(after?.paidAmount).toBe(0)

  const exact = await json(
    await vouchersRoute.POST(
      makeReq('/api/vouchers', {
        method: 'POST',
        session: adminSess(),
        body: { type: 'RECEIPT', amount: total, invoiceId },
      })
    )
  )
  expect(exact.status).toBe(200)

  const paid = await db.invoice.findUnique({ where: { id: invoiceId }, select: { paidAmount: true, status: true } })
  expect(paid?.paidAmount).toBe(200)
  expect(paid?.status).toBe('PAID')

  // second payment now exceeds due again → 409
  const more = await json(
    await vouchersRoute.POST(
      makeReq('/api/vouchers', {
        method: 'POST',
        session: adminSess(),
        body: { type: 'RECEIPT', amount: 1, invoiceId },
      })
    )
  )
  expect(more.status).toBe(409)
})

// ─────────── H2/H3: cross-org FK references rejected ───────────
test('H2. voucher referencing ANOTHER org customer → 400, nothing created', async () => {
  const foreign = await db.customer.create({ data: { orgId: orgB.id, name: 'Foreign Cust' } })
  const r = await json(
    await vouchersRoute.POST(
      makeReq('/api/vouchers', {
        method: 'POST',
        session: adminSess(),
        body: { type: 'RECEIPT', amount: 10, customerId: foreign.id },
      })
    )
  )
  expect(r.status).toBe(400)
  expect(r.json.error).toBe('customer-not-found')
  expect(await db.voucher.count({ where: { orgId: orgA.id, customerId: foreign.id } })).toBe(0)
})

test('H3. product referencing ANOTHER org category → 400', async () => {
  const foreignCat = await db.category.create({ data: { orgId: orgB.id, name: 'Foreign Cat' } })
  const r = await json(
    await productsRoute.POST(
      makeReq('/api/products', {
        method: 'POST',
        session: adminSess(),
        body: { name: 'X-Sell', categoryId: foreignCat.id },
      })
    )
  )
  expect(r.status).toBe(400)
  expect(r.json.error).toBe('category-not-found')
  expect(await db.product.count({ where: { orgId: orgA.id, categoryId: foreignCat.id } })).toBe(0)
})

// ─────────── H4: barcode uniqueness per org ───────────
test('H4. duplicate barcode in same org → 400 duplicate-barcode', async () => {
  const first = await json(
    await productsRoute.POST(
      makeReq('/api/products', {
        method: 'POST',
        session: adminSess(),
        body: { name: 'Scan One', barcode: 'HARD-BAR-0001' },
      })
    )
  )
  expect(first.status).toBe(200)
  const dup = await json(
    await productsRoute.POST(
      makeReq('/api/products', {
        method: 'POST',
        session: adminSess(),
        body: { name: 'Scan Two', barcode: 'HARD-BAR-0001' },
      })
    )
  )
  expect(dup.status).toBe(400)
  expect(dup.json.error).toBe('duplicate-barcode')
  // same barcode in ANOTHER org is fine (tenant-scoped unique)
  const otherOrg = await json(
    await productsRoute.POST(
      makeReq('/api/products', {
        method: 'POST',
        session: adminBSess(),
        body: { name: 'Scan B', barcode: 'HARD-BAR-0001' },
      })
    )
  )
  expect(otherOrg.status).toBe(200)
})

// ─────────── H5/H6: user invite hardening ───────────
test('H5. concurrent duplicate-email invites → exactly one 200, other 400', async () => {
  const body = { name: 'Racer', email: 'racer@hard.test', password: 'race-123456' }
  const [r1, r2] = await Promise.all([
    json(await usersRoute.POST(makeReq('/api/users', { method: 'POST', session: adminSess(), body }))),
    json(await usersRoute.POST(makeReq('/api/users', { method: 'POST', session: adminSess(), body }))),
  ])
  const codes = [r1.status, r2.status].sort()
  expect(codes).toEqual([200, 400])
  expect(await db.user.count({ where: { email: 'racer@hard.test' } })).toBe(1)
})

test('H6. invite with non-email string → 400 invalid-email', async () => {
  const r = await json(
    await usersRoute.POST(
      makeReq('/api/users', {
        method: 'POST',
        session: adminSess(),
        body: { name: 'NoMail', email: 'not-an-email', password: 'valid-123456' },
      })
    )
  )
  expect(r.status).toBe(400)
  expect(r.json.error).toBe('invalid-email')
})

// ─────────── H7: last-admin race guard ───────────
test('H7. two admins demote EACH OTHER concurrently → ≥1 active admin always survives', async () => {
  const [r1, r2] = await Promise.all([
    json(
      await userIdRoute.PUT(makeReq(`/api/users/${adminA.id}`, {
        method: 'PUT',
        session: admin2Sess(),
        body: { role: 'CASHIER' },
      }), { params: Promise.resolve({ id: adminA.id }) })
    ),
    json(
      await userIdRoute.PUT(makeReq(`/api/users/${admin2A.id}`, {
        method: 'PUT',
        session: adminSess(),
        body: { role: 'CASHIER' },
      }), { params: Promise.resolve({ id: admin2A.id }) })
    ),
  ])
  const codes = [r1.status, r2.status].sort((a, b) => a - b)
  // The loser is blocked either by the last-admin guard (400) or — if its
  // session was re-read AFTER the winner committed — by losing ADMIN rights
  // mid-flight (403). Both outcomes leave ≥1 active admin; exactly one wins.
  expect(codes[0]).toBe(200)
  expect([400, 403]).toContain(codes[1])
  if (codes[1] === 400) expect(r2.json.error === 'last-admin' || r1.json.error === 'last-admin').toBe(true)
  const activeAdmins = await db.user.count({ where: { orgId: orgA.id, role: 'ADMIN', active: true } })
  expect(activeAdmins).toBe(1)
  // restore both admins so later tests in this file see a stable fixture
  await db.user.update({ where: { id: adminA.id }, data: { role: 'ADMIN', active: true } })
  await db.user.update({ where: { id: admin2A.id }, data: { role: 'ADMIN', active: true } })
})

// ─────────── H8/H9: settings guards ───────────
test('H8. MANAGER cannot toggle allowNegativeStock → 403; ADMIN can → 200', async () => {
  const asMgr = await json(
    await settingsOrgRoute.PUT(
      makeReq('/api/settings/org', { method: 'PUT', session: managerSess(), body: { allowNegativeStock: false } })
    )
  )
  expect(asMgr.status).toBe(403)
  const asAdmin = await json(
    await settingsOrgRoute.PUT(
      makeReq('/api/settings/org', { method: 'PUT', session: adminSess(), body: { allowNegativeStock: false } })
    )
  )
  expect(asAdmin.status).toBe(200)
  expect(asAdmin.json.data.allowNegativeStock).toBe(false)
  // restore default policy for other tests
  await settingsOrgRoute.PUT(
    makeReq('/api/settings/org', { method: 'PUT', session: adminSess(), body: { allowNegativeStock: true } })
  )
})

test('H9. logo: SVG data URL → 400; PNG data URL → 200', async () => {
  const svg = await json(
    await settingsOrgRoute.PUT(
      makeReq('/api/settings/org', {
        method: 'PUT',
        session: adminSess(),
        body: { logo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
      })
    )
  )
  expect(svg.status).toBe(400)
  expect(svg.json.error).toBe('invalid-logo')
  const png = await json(
    await settingsOrgRoute.PUT(
      makeReq('/api/settings/org', {
        method: 'PUT',
        session: adminSess(),
        body: { logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' },
      })
    )
  )
  expect(png.status).toBe(200)
})

// ─────────── H10–H13: input sanity + delete guard ───────────
test('H10. openingQty with 60 entries → 400 too-many-openings', async () => {
  const fakeWh = Array.from({ length: 60 }, () => ({ warehouseId: whA.id, qty: 1 }))
  const r = await json(
    await productsRoute.POST(
      makeReq('/api/products', {
        method: 'POST',
        session: adminSess(),
        body: { name: 'Flood', openingQty: fakeWh },
      })
    )
  )
  expect(r.status).toBe(400)
  expect(r.json.error).toBe('too-many-openings')
})

test('H11. invoice item qty 1e12 → 400 qty-too-large', async () => {
  const r = await json(
    await invoicesRoute.POST(
      makeReq('/api/invoices', {
        method: 'POST',
        session: adminSess(),
        body: { type: 'SALE', warehouseId: whA.id, items: [{ productId: prodA.id, qty: 1e12 }] },
      })
    )
  )
  expect(r.status).toBe(400)
  expect(r.json.error).toBe('qty-too-large')
})

test('H12. voucher dated year 9999 → clamped into sane range, not 9999', async () => {
  const r = await json(
    await vouchersRoute.POST(
      makeReq('/api/vouchers', {
        method: 'POST',
        session: adminSess(),
        body: { type: 'RECEIPT', amount: 5, date: '9999-12-31T00:00:00.000Z' },
      })
    )
  )
  expect(r.status).toBe(200)
  const year = new Date(r.json.data.date).getFullYear()
  expect(year).toBeGreaterThanOrEqual(2000)
  expect(year).toBeLessThanOrEqual(2100)
})

test('H13. product with live stock levels → DELETE deactivates (no FK 500)', async () => {
  const created = await json(
    await productsRoute.POST(
      makeReq('/api/products', {
        method: 'POST',
        session: adminSess(),
        body: { name: 'Stocked', openingQty: [{ warehouseId: whA.id, qty: 7 }] },
      })
    )
  )
  expect(created.status).toBe(200)
  const id = created.json.data.id
  const del = await json(
    await productDetailRoute.DELETE(makeReq(`/api/products/${id}`, { method: 'DELETE', session: adminSess() }), {
      params: Promise.resolve({ id }),
    })
  )
  expect(del.status).toBe(200)
  expect(del.json.data.deactivated).toBe(true)
  const stillThere = await db.product.findUnique({ where: { id }, select: { active: true } })
  expect(stillThere?.active).toBe(false)
})

// ─────────── H14: search input cap (defense-in-depth on LIKE patterns) ───────────
test('H14. product search: q capped at 100 chars (observable via contains semantics)', async () => {
  // Product name = 110 'x' chars. Searching 120 'x' chars:
  //   WITHOUT the cap → contains('%x×120%') cannot match a 110-char name → miss
  //   WITH the cap    → q is truncated to 100 'x' chars → 110-char name matches → hit
  // The hit therefore PROVES the cap is applied to the query pattern.
  const longName = 'x'.repeat(110)
  const created = await json(
    await productsRoute.POST(
      makeReq('/api/products', {
        method: 'POST',
        session: adminSess(),
        body: { name: longName },
      })
    )
  )
  expect(created.status).toBe(200)

  const hit = await json(
    await productsRoute.GET(makeReq(`/api/products?q=${encodeURIComponent('x'.repeat(120))}`, { session: adminSess() }))
  )
  expect(hit.status).toBe(200)
  expect(hit.json.data.rows.some((r: { name: string }) => r.name === longName)).toBe(true)

  // sanity: normal short search still works (fast-path exact miss → LIKE scan)
  const normal = await json(
    await productsRoute.POST(
      makeReq('/api/products', {
        method: 'POST',
        session: adminSess(),
        body: { name: 'ZebraCap UniqueWidget' },
      })
    )
  )
  expect(normal.status).toBe(200)
  const found = await json(
    await productsRoute.GET(makeReq('/api/products?q=ZebraCap', { session: adminSess() }))
  )
  expect(found.status).toBe(200)
  expect(found.json.data.rows.some((r: { name: string }) => r.name === 'ZebraCap UniqueWidget')).toBe(true)

  // absurd 5KB query → bounded, 200, no crash
  const flood = 'q'.repeat(5000)
  const floodRes = await json(
    await productsRoute.GET(makeReq(`/api/products?q=${encodeURIComponent(flood)}`, { session: adminSess() }))
  )
  expect(floodRes.status).toBe(200)
  expect(Array.isArray(floodRes.json.data.rows)).toBe(true)
})

// ─────────── H15: DB-backed fail-only login brute-force ledger ───────────
test('H15. login ledger: 10 fails → 401, 11th → 429; correct password never locked out', async () => {
  // a) unknown account hammered with wrong passwords → rows land in the DB
  const codes: number[] = []
  for (let i = 0; i < 11; i++) {
    const r = await json(
      await loginRoute.POST(
        makeReq('/api/auth/login', {
          method: 'POST',
          body: { email: 'ghost@hard.test', password: `wrong-pass-${i}` },
        })
      )
    )
    codes.push(r.status)
  }
  expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true)
  expect(codes[10]).toBe(429)
  // the ledger itself is the enforcement store — 11 failures persisted
  expect(await db.loginAttempt.count({ where: { email: 'ghost@hard.test' } })).toBe(11)

  // b) FAIL-ONLY property: a real account with failures on record is NOT
  // locked out — its correct-password attempt never touches the limiter path.
  for (let i = 0; i < 3; i++) {
    const r = await json(
      await loginRoute.POST(
        makeReq('/api/auth/login', {
          method: 'POST',
          body: { email: 'admin-a@hard.test', password: 'not-the-pass' },
        })
      )
    )
    expect(r.status).toBe(401)
  }
  const good = await json(
    await loginRoute.POST(
      makeReq('/api/auth/login', {
        method: 'POST',
        body: { email: 'admin-a@hard.test', password: 'hardening-pass-123' },
      })
    )
  )
  expect(good.status).toBe(200)
  expect(good.json.data.user.email).toBe('admin-a@hard.test')

  // keep the fixture tidy for any later assertions
  await db.loginAttempt.deleteMany({})
})
