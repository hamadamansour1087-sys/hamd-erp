/**
 * H.A.M.D ERP — SCALE TESTS (PHASE 18/19/20 of docs/PRODUCTION-DEPLOYMENT.md)
 *
 * Runs against PRODUCTION build instances (next start), NOT the dev server:
 *   instance A: http://127.0.0.1:3100  (default LOAD_BASE_URL)
 *   instance B: http://127.0.0.1:3101  (default LOAD_BASE_URL_B)
 * both pointed at the dedicated `hamd_load` PostgreSQL database (never the
 * production/development data), so nothing real can be damaged.
 *
 * Phases:
 *   A  health baseline            100 concurrent
 *   B  login load                 100 concurrent (legit users must never 429)
 *   C  read load                  100 + 500 concurrent mixed reads
 *   D  write load                 100 concurrent sales (unique idempotency keys)
 *   E  inventory concurrency      100 concurrent sales on ONE product split
 *                                  across BOTH instances → StockLevel ===
 *                                  initial + Σ ledger, no lost update
 *   F  idempotent retries         20 concurrent retries, ONE key → 1 document
 *   G  concurrent payments        30 parallel vouchers ×20 on a 300 invoice →
 *                                  paidAmount lands exactly at 300 (15×200,
 *                                  15×409), CAS keeps money correct
 *   H  tenant isolation @load     100 orgs: cross-tenant reads → 404, own → 200
 *
 * Usage:
 *   DATABASE_URL="postgresql://...hamd_load" bun scripts/scale-test.ts
 */
import { PrismaClient } from '@prisma/client'

const BASE_A = process.env.LOAD_BASE_URL ?? 'http://127.0.0.1:3100'
const BASE_B = process.env.LOAD_BASE_URL_B ?? 'http://127.0.0.1:3101'
const DB_URL = process.env.DATABASE_URL ?? ''
if (!DB_URL.includes('hamd_load')) {
  console.error('[scale] refusing to run: DATABASE_URL must point at the hamd_load database')
  process.exit(2)
}

const db = new PrismaClient({ datasources: { db: { url: DB_URL } } })
const PASSWORD = 'load-test-pass-123'
const ADMIN_EMAIL = 'admin@load.test'

let failures = 0
const log = (...a: unknown[]) => console.log('[scale]', ...a)
const line = (label: string, okCount: number, total: number, note = '') => {
  const bad = total - okCount
  if (bad > 0) failures++
  console.log(`  ${label.padEnd(46)} ${String(okCount).padStart(4)}/${total}${bad ? `  ❌ ${bad} bad` : '  ✅'} ${note}`)
}

function hashSync(password: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { hashPassword } = require('../src/lib/auth') as typeof import('../src/lib/auth')
  return hashPassword(password)
}

async function api(
  base: string,
  path: string,
  opts: { method?: string; body?: unknown; cookie?: string; key?: string } = {}
): Promise<{ status: number; json: any; setCookie?: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.cookie) headers.cookie = `session=${opts.cookie}`
  if (opts.key) headers['idempotency-key'] = opts.key
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const setCookie = res.headers.get('set-cookie')?.match(/session=([^;]+)/)?.[1]
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json, setCookie }
}

async function concurrent<T>(n: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: n }, (_, i) => fn(i)))
}

async function main() {
  const t0 = Date.now()
  log('instances:', BASE_A, '+', BASE_B)
  log('database : hamd_load (dedicated — real data untouched)')

  // ── SEED ──
  log('seeding 100 orgs …')
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

  const pw = hashSync(PASSWORD)
  const L0 = await db.org.create({ data: { name: 'Load Org 0', taxPercent: 0, allowNegativeStock: false } })
  const admin = await db.user.create({
    data: { orgId: L0.id, email: ADMIN_EMAIL, name: 'Load Admin', passwordHash: pw, role: 'ADMIN' },
  })
  const wh = await db.warehouse.create({ data: { orgId: L0.id, name: 'WH-A', isDefault: true } })
  const whB = await db.warehouse.create({ data: { orgId: L0.id, name: 'WH-B', isDefault: false } })
  const products = []
  for (let i = 0; i < 8; i++) {
    const p = await db.product.create({
      data: { orgId: L0.id, name: `Load Prod ${i}`, barcode: `LOAD-${String(i).padStart(6, '0')}`, price: 10 + i, cost: 5, trackStock: true },
    })
    await db.stockLevel.create({ data: { productId: p.id, warehouseId: wh.id, qty: 10000 } })
    products.push(p)
  }
  for (let i = 0; i < 6; i++) await db.customer.create({ data: { orgId: L0.id, name: `Load Cust ${i}` } })
  for (let i = 0; i < 4; i++) await db.supplier.create({ data: { orgId: L0.id, name: `Load Sup ${i}` } })
  await db.counter.create({ data: { orgId: L0.id, docKey: 'INV', next: 1 } })

  // 100 isolation orgs, each: 1 admin, 1 product, 1 customer, 1 SALE invoice
  const isolation: Array<{ email: string; cookie: string; ownInvoiceId: string }> = []
  for (let i = 1; i <= 100; i++) {
    const o = await db.org.create({ data: { name: `Iso Org ${i}`, taxPercent: 0 } })
    await db.user.create({
      data: { orgId: o.id, email: `admin${i}@iso.test`, name: `Iso Admin ${i}`, passwordHash: pw, role: 'ADMIN' },
    })
    const p = await db.product.create({ data: { orgId: o.id, name: `Iso Prod ${i}`, price: 50, cost: 20, trackStock: false } })
    await db.invoice.create({
      data: {
        orgId: o.id, number: 1, type: 'SALE', status: 'UNPAID',
        total: 50, subtotal: 50,
        items: { create: [{ productId: p.id, nameSnap: p.name, qty: 1, price: 50, total: 50 }] },
      },
    })
    isolation.push({ email: `admin${i}@iso.test`, cookie: '', ownInvoiceId: '' })
    void whB
  }
  log(`seeded: org=${await db.org.count()} users=${await db.user.count()} products=${await db.product.count()}`)

  // ── A. health baseline (100 concurrent) ──
  const a = await concurrent(100, () => api(BASE_A, '/api/health'))
  line('A. health 100 concurrent', a.filter((r) => r.status === 200 && r.json.status === 'ok').length, 100)

  // ── B. login load (100 concurrent, legit) ──
  const b = await concurrent(100, () =>
    api(BASE_A, '/api/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: PASSWORD } })
  )
  line('B. login 100 concurrent', b.filter((r) => r.status === 200).length, 100)
  const cookie = b[0].setCookie ?? ''
  if (!cookie) {
    console.error('[scale] FATAL: no session cookie from login')
    process.exit(1)
  }

  // ── C. read load: 100 then 500 concurrent ──
  const c1 = await concurrent(100, (i) => api(BASE_A, `/api/products?q=Load%20Prod%20${i % 8}&page=1&pageSize=5`, { cookie }))
  line('C1. product search 100 concurrent', c1.filter((r) => r.status === 200 && r.json.data?.rows?.length > 0).length, 100)
  const c2 = await concurrent(500, (i) => {
    const bases = [BASE_A, BASE_B]
    const paths = ['/api/products?page=1&pageSize=10', '/api/customers', '/api/health']
    return api(bases[i % 2], paths[i % 3], { cookie })
  })
  line('C2. mixed reads 500 concurrent (2 instances)', c2.filter((r) => r.status === 200).length, 500)

  // ── D. write load: 100 concurrent sales ──
  const d = await concurrent(100, (i) =>
    api(BASE_A, '/api/invoices', {
      method: 'POST', cookie, key: `load-sale-${Date.now()}-${i}`,
      body: { type: 'SALE', warehouseId: wh.id, taxPercent: 0, paidAmount: 10 + (i % 8), items: [{ productId: products[i % 8].id, qty: 1 }] },
    })
  )
  line('D. create sale 100 concurrent', d.filter((r) => r.status === 200).length, 100)
  const dIds = d.filter((r) => r.status === 200).map((r) => r.json.data.id)
  if (new Set(dIds).size !== dIds.length) { failures++; console.log('  ❌ duplicate invoice ids in D') }

  // ── E. inventory concurrency: 100 sales on ONE product across 2 instances ──
  const solo = await db.product.create({
    data: { orgId: L0.id, name: 'Solo Prod', price: 5, cost: 2, trackStock: true },
  })
  await db.stockLevel.create({ data: { productId: solo.id, warehouseId: wh.id, qty: 100 } })
  const e = await concurrent(100, (i) =>
    api(i % 2 === 0 ? BASE_A : BASE_B, '/api/invoices', {
      method: 'POST', cookie, key: `load-solo-${Date.now()}-${i}`,
      body: { type: 'SALE', warehouseId: wh.id, taxPercent: 0, paidAmount: 5, items: [{ productId: solo.id, qty: 1 }] },
    })
  )
  const eOk = e.filter((r) => r.status === 200).length
  const levelAfter = await db.stockLevel.findUnique({ where: { productId_warehouseId: { productId: solo.id, warehouseId: wh.id } } })
  const ledgerSum = (await db.stockMovement.findMany({ where: { productId: solo.id } })).reduce((s, m) => s + Number(m.qty), 0)
  const expectedFinal = 100 - eOk
  const eInv = eOk === 100 && Number(levelAfter?.qty) === expectedFinal && Math.abs(ledgerSum - (-eOk)) < 0.0001
  if (!eInv) failures++
  console.log(`  ${'E. 100 sales on 1 product via 2 instances'.padEnd(46)} ok=${eOk}/100  stock=${Number(levelAfter?.qty)}  ledger=${ledgerSum}  ${eInv ? '✅ StockLevel == initial + Σ ledger' : '❌ INVARIANT BROKEN'}`)

  // ── F. idempotent retries: 20 concurrent, ONE key ──
  const keyF = `load-idem-${Date.now()}`
  const f = await concurrent(20, () =>
    api(BASE_A, '/api/invoices', {
      method: 'POST', cookie, key: keyF,
      body: { type: 'SALE', warehouseId: wh.id, taxPercent: 0, paidAmount: 0, items: [{ productId: products[0].id, qty: 1 }] },
    })
  )
  const fIds = f.filter((r) => r.status === 200).map((r) => r.json.data.id).filter(Boolean)
  const fUnique = await db.invoice.findMany({ where: { orgId: L0.id, clientOperationId: { contains: '' } } })
  void fUnique
  const oneDoc = await db.invoice.count({ where: { AND: [{ orgId: L0.id }, { number: f.find((r) => r.status === 200)?.json.data.number }] } })
  const fOk = f.every((r) => r.status === 200) && fIds.length > 0 && new Set(fIds).size === 1 && oneDoc === 1
  if (!fOk) failures++
  console.log(`  ${'F. 20 retries ONE idempotency key'.padEnd(46)} statuses=${f.map((r) => r.status).join(',')?.slice(0, 30)} ids=${new Set(fIds).size} docs=${oneDoc}  ${fOk ? '✅ exactly one logical sale' : '❌'}`)

  // ── G. concurrent payments: 30×20 on a 300 invoice ──
  const gInv = await api(BASE_A, '/api/invoices', {
    method: 'POST', cookie,
    body: { type: 'PURCHASE', warehouseId: wh.id, taxPercent: 0, paidAmount: 0, items: [{ productId: products[1].id, qty: 30, price: 10 }] },
  })
  const gInvId = gInv.json.data.id
  const g = await concurrent(30, (i) =>
    api(i % 2 === 0 ? BASE_A : BASE_B, '/api/vouchers', {
      method: 'POST', cookie, key: `load-pay-${Date.now()}-${i}`,
      body: { type: 'PAYMENT', amount: 20, invoiceId: gInvId },
    })
  )
  const g200 = g.filter((r) => r.status === 200).length
  const g409 = g.filter((r) => r.status === 409).length
  const gPaid = Number((await db.invoice.findUnique({ where: { id: gInvId } }))?.paidAmount ?? -1)
  const gOk = g200 === 15 && g409 === 15 && gPaid === 300
  if (!gOk) failures++
  console.log(`  ${'G. 30 concurrent ×20 payments on 300 due'.padEnd(46)} 200=${g200} 409=${g409} paid=${gPaid}  ${gOk ? '✅ CAS kept money exact' : '❌'}`)

  // ── H. tenant isolation @load (100 orgs) ──
  // login all 100 isolation admins (split across instances)
  for (let i = 0; i < 100; i += 25) {
    const batch = isolation.slice(i, i + 25)
    await Promise.all(
      batch.map(async (o) => {
        const r = await api(o.email.endsWith('6.test') || o.email.endsWith('7.test') ? BASE_B : BASE_A, '/api/auth/login', {
          method: 'POST', body: { email: o.email, password: PASSWORD },
        })
        o.cookie = r.setCookie ?? ''
      })
    )
  }
  // fetch own invoice ids
  await Promise.all(isolation.map(async (o, i) => {
    const r = await api(i % 2 ? BASE_B : BASE_A, '/api/invoices?page=1&pageSize=1', { cookie: o.cookie })
    o.ownInvoiceId = r.json.data?.rows?.[0]?.id ?? ''
  }))
  // cross-tenant reads: org i reads org (i+1 mod 100)'s invoice — must 404
  const h = await concurrent(100, (i) => {
    const o = isolation[i]
    const other = isolation[(i + 1) % 100]
    return api(i % 2 ? BASE_B : BASE_A, `/api/invoices/${other.ownInvoiceId}`, { cookie: o.cookie })
  })
  // positive control: own reads must 200
  const hOwn = await concurrent(100, (i) => {
    const o = isolation[i]
    return api(i % 2 ? BASE_B : BASE_A, `/api/invoices/${o.ownInvoiceId}`, { cookie: o.cookie })
  })
  line('H1. cross-tenant invoice read (100 orgs)', h.filter((r) => r.status === 404).length, 100, 'all must 404')
  line('H2. own-tenant invoice read (positive)', hOwn.filter((r) => r.status === 200).length, 100, 'all must 200')
  const noAuth = await concurrent(50, (i) => api(i % 2 ? BASE_B : BASE_A, '/api/products?page=1'))
  line('H3. unauthenticated reads', noAuth.filter((r) => r.status === 401).length, 50, 'all must 401')

  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n[scale] ${failures === 0 ? 'ALL SCALE TESTS PASSED' : `${failures} FAILURE(S)`} in ${secs}s`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error('[scale] FATAL:', e)
  await db.$disconnect()
  process.exit(1)
})
