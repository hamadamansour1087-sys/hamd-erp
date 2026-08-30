/**
 * DB verification helper for the Offline POS E2E test.
 * Subcommands:
 *   bun scripts/offline-db-check.ts before                 → snapshot counts → /tmp/offline-db-before.json
 *   bun scripts/offline-db-check.ts after <key> <before>   → counts + diff + latest e2e invoice details
 *                                                            + clientOperationId verification against <key>
 *
 * Payment in this system = auto Voucher (RECEIPT for SALE) tied by invoiceId.
 */
import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'

const db = new PrismaClient()
const EMAIL = 'offline-e2e@hamd.test'

async function snapshot() {
  const [invoices, movements, receipts] = await Promise.all([
    db.invoice.count(),
    db.stockMovement.count(),
    db.voucher.count({ where: { type: 'RECEIPT' } }),
  ])
  return { invoices, stockMovements: movements, receiptVouchers: receipts }
}

async function before() {
  const snap = await snapshot()
  const out = '/tmp/offline-db-before.json'
  writeFileSync(out, JSON.stringify(snap, null, 2))
  console.log(JSON.stringify({ ok: true, out, ...snap }, null, 2))
}

async function after(rawKey: string, beforeFile: string) {
  const expectedClientOpId = `invoice:${createHash('sha256').update(rawKey).digest('hex')}`
  const beforeSnap = JSON.parse(readFileSync(beforeFile, 'utf8'))
  const now = await snapshot()

  const user = await db.user.findUnique({ where: { email: EMAIL } })
  if (!user) throw new Error('e2e user missing')

  const inv = await db.invoice.findFirst({
    where: { orgId: user.orgId, clientOperationId: expectedClientOpId },
    include: { items: { select: { productId: true, qty: true, price: true, total: true } } },
    orderBy: { date: 'desc' },
  })
  if (!inv) {
    console.log(
      JSON.stringify(
        { ok: false, reason: 'invoice with expected clientOperationId NOT found', expectedClientOpId, counts: now },
        null,
        2
      )
    )
    process.exit(2)
  }
  const [movements, receipts, dupes] = await Promise.all([
    db.stockMovement.findMany({
      where: { refType: 'INVOICE', refId: inv.id },
      select: { id: true, productId: true, qty: true, kind: true },
    }),
    db.voucher.findMany({
      where: { invoiceId: inv.id },
      select: { id: true, number: true, type: true, amount: true, method: true, partyType: true },
    }),
    db.invoice.count({ where: { orgId: inv.orgId, clientOperationId: expectedClientOpId } }),
  ])
  const customer = inv.customerId
    ? await db.customer.findUnique({ where: { id: inv.customerId }, select: { id: true, name: true, openingBalance: true } })
    : null

  const diff = {
    invoices: now.invoices - beforeSnap.invoices,
    stockMovements: now.stockMovements - beforeSnap.stockMovements,
    receiptVouchers: now.receiptVouchers - beforeSnap.receiptVouchers,
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        diff,
        counts: now,
        invoice: {
          id: inv.id,
          number: inv.number,
          type: inv.type,
          status: inv.status,
          total: inv.total,
          paidAmount: inv.paidAmount,
          clientOperationId: inv.clientOperationId,
          clientOperationIdMatchesKey: inv.clientOperationId === expectedClientOpId,
          items: inv.items,
        },
        movements,
        receiptVouchers: receipts,
        duplicateInvoiceCount: dupes,
        customer,
      },
      null,
      2
    )
  )
}

const cmd = process.argv[2]
if (cmd === 'before') void before()
else if (cmd === 'after') void after(process.argv[3], process.argv[4])
else {
  console.error('usage: offline-db-check.ts before | after <idempotency-key> <before-file>')
  process.exit(1)
}
