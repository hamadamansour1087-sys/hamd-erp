/**
 * RESTORE VERIFICATION — compares a freshly restored PostgreSQL cluster
 * (scratch instance on :5433) against the LIVE one (:5432): the 16 entity
 * counts plus the money/stock totals must match exactly. Any discrepancy
 * exits non-zero. Invoked by scripts/pg-restore-verify.sh.
 */
const LIVE_URL = process.env.LIVE_URL ?? 'postgresql://hamd@127.0.0.1:5432/hamd'
const RESTORE_URL = process.env.RESTORE_URL ?? 'postgresql://hamd@127.0.0.1:5433/hamd'

import { Client } from 'pg'

const TABLES = [
  'Org', 'User', 'Counter', 'IdempotencyKey', 'LoginAttempt',
  'Category', 'Unit', 'Warehouse', 'Product', 'StockLevel', 'StockMovement',
  'Customer', 'Supplier', 'Invoice', 'InvoiceItem', 'Voucher', 'Expense',
  'Transfer', 'TransferItem',
]

const TOTALS = [
  ['salesTotal', `SELECT COALESCE(SUM("total"),0) v FROM "Invoice" WHERE "type"='SALE'`],
  ['purchaseTotal', `SELECT COALESCE(SUM("total"),0) v FROM "Invoice" WHERE "type"='PURCHASE'`],
  ['paidAmount', `SELECT COALESCE(SUM("paidAmount"),0) v FROM "Invoice"`],
  ['receipts', `SELECT COALESCE(SUM("amount"),0) v FROM "Voucher" WHERE "type"='RECEIPT'`],
  ['payments', `SELECT COALESCE(SUM("amount"),0) v FROM "Voucher" WHERE "type"='PAYMENT'`],
  ['expenses', `SELECT COALESCE(SUM("amount"),0) v FROM "Expense"`],
  ['stockQty', `SELECT COALESCE(SUM("qty"),0) v FROM "StockLevel"`],
  ['ledgerQty', `SELECT COALESCE(SUM("qty"),0) v FROM "StockMovement"`],
]

async function snapshot(url: string) {
  const c = new Client({ connectionString: url })
  await c.connect()
  const counts: Record<string, string> = {}
  for (const t of TABLES) {
    const r = await c.query(`SELECT COUNT(*) v FROM "${t}"`)
    counts[t] = r.rows[0].v
  }
  const totals: Record<string, string> = {}
  for (const [k, sql] of TOTALS) {
    const r = await c.query(sql)
    totals[k] = r.rows[0].v
  }
  await c.end()
  return { counts, totals }
}

async function main() {
  const t0 = Date.now()
  const [live, restored] = await Promise.all([snapshot(LIVE_URL), snapshot(RESTORE_URL)])
  let bad = 0
  console.log('\n[verify] table            live   restored')
  for (const t of TABLES) {
    const okv = live.counts[t] === restored.counts[t]
    if (!okv) bad++
    console.log(`  ${t.padEnd(16)} ${String(live.counts[t]).padStart(6)} ${String(restored.counts[t]).padStart(8)}   ${okv ? 'OK' : 'MISMATCH'}`)
  }
  console.log('\n[verify] total          live          restored')
  for (const [k] of TOTALS) {
    const okv = live.totals[k] === restored.totals[k]
    if (!okv) bad++
    console.log(`  ${k.padEnd(16)} ${live.totals[k].padStart(12)} ${restored.totals[k].padStart(12)}   ${okv ? 'OK' : 'MISMATCH'}`)
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n[verify] ${bad === 0 ? '✅ 0 discrepancies' : `❌ ${bad} discrepancy(ies)`} (verification took ${secs}s)`)
  process.exit(bad === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('[verify] FATAL:', e.message)
  process.exit(1)
})
