/**
 * SQLite → PostgreSQL DATA MIGRATION for H.A.M.D ERP.
 *
 * Design goals (per docs/DATABASE-MIGRATION.md):
 *  - deterministic:   fixed table order, fixed per-row mapping, no timestamps invented
 *  - repeatable:      refuses to run on a non-empty target unless --reset is passed
 *                     (with --reset it wipes + re-inserts inside the same transaction,
 *                     so a re-run always converges to the same end state)
 *  - logged:          per-table row counts printed for source and target
 *  - validated:       after the commit it re-reads BOTH databases and compares
 *                     the 16-entity counts and the money/stock totals; any
 *                     discrepancy beyond rounding tolerance exits non-zero
 *  - transaction-safe: every insert happens inside ONE PostgreSQL transaction —
 *                     either the whole tenant lands or nothing does
 *
 * The original SQLite file is opened READ-ONLY through a dedicated legacy
 * client (prisma/legacy-sqlite/schema.prisma) and is never written to.
 *
 * Usage:
 *   LEGACY_DATABASE_URL="file:/abs/path/custom.db" \
 *   DATABASE_URL="postgresql://user:pass@host:5432/hamd" \
 *   bun scripts/migrate-sqlite-to-postgres.ts [--reset]
 */
import path from 'node:path'

const LEGACY_URL = process.env.LEGACY_DATABASE_URL ?? `file:${path.resolve('db/custom.db')}`
const TARGET_URL = process.env.DATABASE_URL ?? ''
if (!TARGET_URL.startsWith('postgresql')) {
  console.error('[migrate] FATAL: DATABASE_URL must point to PostgreSQL (production provider).')
  process.exit(2)
}
const RESET = process.argv.includes('--reset')

// Two typed clients, two engines, one process each side of the bridge:
const { PrismaClient: LegacyClient } = await import('../node_modules/.prisma/legacy-sqlite-client')
const { PrismaClient: PgClient } = await import('@prisma/client')

const legacy = new LegacyClient({ datasources: { db: { url: LEGACY_URL } } })
const pg = new PgClient({ datasources: { db: { url: TARGET_URL } } })

const log = (...a: unknown[]) => console.log('[migrate]', ...a)

// FK-safe insertion order: parents before children (Prisma delegate names).
const TABLES = [
  'org', 'user', 'counter', 'idempotencyKey', 'loginAttempt',
  'category', 'unit', 'warehouse', 'product', 'stockLevel', 'stockMovement',
  'customer', 'supplier', 'invoice', 'invoiceItem', 'voucher', 'expense',
  'transfer', 'transferItem',
] as const

type Counts = Record<string, number>

async function readSource(): Promise<{ rows: Record<string, unknown[]>; counts: Counts }> {
  const rows: Record<string, unknown[]> = {}
  rows.org = await legacy.org.findMany()
  rows.user = await legacy.user.findMany()
  rows.counter = await legacy.counter.findMany()
  rows.idempotencyKey = await legacy.idempotencyKey.findMany()
  rows.loginAttempt = await legacy.loginAttempt.findMany()
  rows.category = await legacy.category.findMany()
  rows.unit = await legacy.unit.findMany()
  rows.warehouse = await legacy.warehouse.findMany()
  rows.product = await legacy.product.findMany()
  rows.stockLevel = await legacy.stockLevel.findMany()
  rows.stockMovement = await legacy.stockMovement.findMany()
  rows.customer = await legacy.customer.findMany()
  rows.supplier = await legacy.supplier.findMany()
  rows.invoice = await legacy.invoice.findMany()
  rows.invoiceItem = await legacy.invoiceItem.findMany()
  rows.voucher = await legacy.voucher.findMany()
  rows.expense = await legacy.expense.findMany()
  rows.transfer = await legacy.transfer.findMany()
  rows.transferItem = await legacy.transferItem.findMany()
  const counts: Counts = {}
  for (const t of TABLES) counts[t] = rows[t].length
  return { rows, counts }
}

async function main() {
  const t0 = Date.now()
  log('source  :', LEGACY_URL)
  log('target  :', TARGET_URL.replace(/:[^:@/]+@/, ':***@'))
  log('mode    :', RESET ? 'reset+reload' : 'refuse-if-nonempty')

  const { rows, counts: srcCounts } = await readSource()
  const total = Object.values(srcCounts).reduce((a, b) => a + b, 0)
  log(`source snapshot: ${total} rows across ${TABLES.length} tables`)

  // ── WRITE: one transaction, parents before children ──
  await pg.$transaction(async (tx) => {
    if (RESET) {
      // Reverse FK order: children first.
      for (const t of [...TABLES].reverse()) {
        await (tx as any)[t].deleteMany()
      }
      log('target wiped (--reset)')
    } else {
      const existing = await tx.org.count()
      if (existing > 0) {
        throw new Error(
          `Target already contains ${existing} org(s). Refusing to double-insert. ` +
          'Re-running is possible with --reset (wipes + reloads deterministically).'
        )
      }
    }
    for (const t of TABLES) {
      const data = rows[t]
      await (tx as any)[t].createMany({ data })
    }
  }, { timeout: 180_000, maxWait: 20_000 })
  log('transaction committed')

  // ── VALIDATE: counts + financial/stock totals (source arrays vs live target) ──
  const sum = (arr: unknown[], f: (r: any) => number) =>
    arr.reduce((s: number, r) => s + f(r as never), 0)
  const r2 = (n: number) => Math.round(n * 100) / 100

  const tgtCounts: Counts = {}
  tgtCounts.org = await pg.org.count()
  tgtCounts.user = await pg.user.count()
  tgtCounts.counter = await pg.counter.count()
  tgtCounts.idempotencyKey = await pg.idempotencyKey.count()
  tgtCounts.loginAttempt = await pg.loginAttempt.count()
  tgtCounts.category = await pg.category.count()
  tgtCounts.unit = await pg.unit.count()
  tgtCounts.warehouse = await pg.warehouse.count()
  tgtCounts.product = await pg.product.count()
  tgtCounts.stockLevel = await pg.stockLevel.count()
  tgtCounts.stockMovement = await pg.stockMovement.count()
  tgtCounts.customer = await pg.customer.count()
  tgtCounts.supplier = await pg.supplier.count()
  tgtCounts.invoice = await pg.invoice.count()
  tgtCounts.invoiceItem = await pg.invoiceItem.count()
  tgtCounts.voucher = await pg.voucher.count()
  tgtCounts.expense = await pg.expense.count()
  tgtCounts.transfer = await pg.transfer.count()
  tgtCounts.transferItem = await pg.transferItem.count()

  const tgtAgg = {
    salesTotal: await pg.invoice.aggregate({ _sum: { total: true }, where: { type: 'SALE' } }),
    purchaseTotal: await pg.invoice.aggregate({ _sum: { total: true }, where: { type: 'PURCHASE' } }),
    paidTotal: await pg.invoice.aggregate({ _sum: { paidAmount: true } }),
    receipts: await pg.voucher.aggregate({ _sum: { amount: true }, where: { type: 'RECEIPT' } }),
    payments: await pg.voucher.aggregate({ _sum: { amount: true }, where: { type: 'PAYMENT' } }),
    expenses: await pg.expense.aggregate({ _sum: { amount: true } }),
    custOpen: await pg.customer.aggregate({ _sum: { openingBalance: true } }),
    supOpen: await pg.supplier.aggregate({ _sum: { openingBalance: true } }),
    stockQty: await pg.stockLevel.aggregate({ _sum: { qty: true } }),
    ledgerQty: await pg.stockMovement.aggregate({ _sum: { qty: true } }),
  }

  const srcAgg = {
    salesTotal: sum(rows.invoice, (r: any) => (r.type === 'SALE' ? r.total : 0)),
    purchaseTotal: sum(rows.invoice, (r: any) => (r.type === 'PURCHASE' ? r.total : 0)),
    paidTotal: sum(rows.invoice, (r: any) => r.paidAmount),
    receipts: sum(rows.voucher, (r: any) => (r.type === 'RECEIPT' ? r.amount : 0)),
    payments: sum(rows.voucher, (r: any) => (r.type === 'PAYMENT' ? r.amount : 0)),
    expenses: sum(rows.expense, (r: any) => r.amount),
    custOpen: sum(rows.customer, (r: any) => r.openingBalance),
    supOpen: sum(rows.supplier, (r: any) => r.openingBalance),
    stockQty: sum(rows.stockLevel, (r: any) => r.qty),
    ledgerQty: sum(rows.stockMovement, (r: any) => r.qty),
  }

  let failures = 0
  console.log('\n[data-migration validation]')
  console.log('table              source   target   status')
  for (const t of TABLES) {
    const okc = srcCounts[t] === tgtCounts[t]
    if (!okc) failures++
    console.log(
      `${t.padEnd(18)} ${String(srcCounts[t]).padStart(6)} ${String(tgtCounts[t]).padStart(8)}   ${okc ? 'OK' : 'MISMATCH'}`
    )
  }

  console.log('\ntotal              source   target   diff     status   (money tol 0.005 / qty tol 0.0005)')
  const cmp = (label: string, s: number, t: number, tol: number) => {
    const diff = r2(t) - r2(s)
    const okv = Math.abs(diff) <= tol
    if (!okv) failures++
    console.log(
      `${label.padEnd(18)} ${r2(s).toFixed(2).padStart(8)} ${r2(t).toFixed(2).padStart(8)} ${diff.toFixed(2).padStart(8)}   ${okv ? 'OK' : 'MISMATCH'}`
    )
  }
  cmp('salesTotal', srcAgg.salesTotal, Number(tgtAgg.salesTotal._sum.total ?? 0), 0.005)
  cmp('purchaseTotal', srcAgg.purchaseTotal, Number(tgtAgg.purchaseTotal._sum.total ?? 0), 0.005)
  cmp('paidAmount', srcAgg.paidTotal, Number(tgtAgg.paidTotal._sum.paidAmount ?? 0), 0.005)
  cmp('receipts', srcAgg.receipts, Number(tgtAgg.receipts._sum.amount ?? 0), 0.005)
  cmp('payments', srcAgg.payments, Number(tgtAgg.payments._sum.amount ?? 0), 0.005)
  cmp('expenses', srcAgg.expenses, Number(tgtAgg.expenses._sum.amount ?? 0), 0.005)
  cmp('customerDues(open)', srcAgg.custOpen, Number(tgtAgg.custOpen._sum.openingBalance ?? 0), 0.005)
  cmp('supplierDues(open)', srcAgg.supOpen, Number(tgtAgg.supOpen._sum.openingBalance ?? 0), 0.005)
  cmp('stockQty', srcAgg.stockQty, Number(tgtAgg.stockQty._sum.qty ?? 0), 0.0005)
  cmp('ledgerQty', srcAgg.ledgerQty, Number(tgtAgg.ledgerQty._sum.qty ?? 0), 0.0005)

  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  if (failures > 0) {
    console.error(`\n[migrate] FAILED — ${failures} discrepancy(ies) after ${secs}s. DO NOT switch production traffic.`)
    await Promise.all([legacy.$disconnect(), pg.$disconnect()])
    process.exit(1)
  }
  console.log(`\n[migrate] SUCCESS — 0 discrepancies in ${secs}s. SQLite source left untouched.`)
  await Promise.all([legacy.$disconnect(), pg.$disconnect()])
}

main().catch(async (e) => {
  console.error('[migrate] FATAL:', e)
  await Promise.allSettled([legacy.$disconnect(), pg.$disconnect()])
  process.exit(1)
})
