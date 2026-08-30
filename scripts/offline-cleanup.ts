/**
 * Cleanup for the Offline POS live E2E test: removes ALL artifacts the three
 * test invoices created and restores the books to the exact pre-test state.
 *
 *  - deletes RECEIPT vouchers, StockMovements, InvoiceItems, Invoices,
 *    IdempotencyKey claims for the 3 test clientOperationIds
 *  - restores StockLevel for every deleted movement (adds back |qty|)
 *  - rolls back the INV / RCV number counters by 3 each
 *  - deactivates the E2E cashier user (login disabled; reactivate any time
 *    with: bun scripts/offline-test-user.ts)
 *
 * Run: DATABASE_URL=... bun scripts/offline-cleanup.ts
 */
import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'

const db = new PrismaClient()
const KEYS = ['3i3a0p804dmmtfpdqib', 'yplu71tw8rnmtfpgrvg', '1gf0n3cd60umtfpgtp6']
const EMAIL = 'offline-e2e@hamd.test'

const clientOpId = (raw: string) => `invoice:${createHash('sha256').update(raw).digest('hex')}`

async function main() {
  const user = await db.user.findUnique({ where: { email: EMAIL } })
  if (!user) throw new Error('e2e user missing')
  const orgId = user.orgId

  let invoices = 0
  let movementsRestored = 0
  let vouchers = 0
  let claims = 0

  for (const raw of KEYS) {
    const key = clientOpId(raw)
    const inv = await db.invoice.findFirst({ where: { orgId, clientOperationId: key } })
    if (!inv) {
      console.log(`skip ${raw}: invoice not found (already cleaned)`)
      continue
    }
    // 1. restore stock from movements, then delete them
    const mvs = await db.stockMovement.findMany({ where: { refType: 'INVOICE', refId: inv.id } })
    for (const mv of mvs) {
      if (mv.warehouseId) {
        await db.stockLevel.updateMany({
          where: { productId: mv.productId, warehouseId: mv.warehouseId },
          data: { qty: { decrement: Number(mv.qty) } }, // qty is negative → adds back
        })
      }
      movementsRestored++
    }
    await db.stockMovement.deleteMany({ where: { refType: 'INVOICE', refId: inv.id } })
    // 2. delete the auto RECEIPT voucher(s)
    const v = await db.voucher.deleteMany({ where: { invoiceId: inv.id } })
    vouchers += v.count
    // 3. delete items + invoice
    await db.invoiceItem.deleteMany({ where: { invoiceId: inv.id } })
    await db.invoice.delete({ where: { id: inv.id } })
    invoices++
    // 4. delete the idempotency claim
    const c = await db.idempotencyKey.deleteMany({ where: { orgId, key } })
    claims += c.count
    console.log(`removed invoice ${inv.number} (${inv.id})`)
  }

  // 5. roll back number counters (3 invoices + 3 receipts were issued)
  const cnt = await db.counter.updateMany({
    where: { orgId, docKey: { in: ['INV', 'RCV'] }, next: { gte: 4 } },
    data: { next: { decrement: 3 } },
  })

  // 6. deactivate the E2E user
  await db.user.update({ where: { email: EMAIL }, data: { active: false } })

  // final state
  const [invCount, mvCount, rcvCount] = await Promise.all([
    db.invoice.count(),
    db.stockMovement.count(),
    db.voucher.count({ where: { type: 'RECEIPT' } }),
  ])
  const stocks = await db.stockLevel.findMany({
    where: { product: { orgId }, warehouse: { orgId } },
    select: { qty: true, product: { select: { name: true } } },
    orderBy: { qty: 'desc' },
    take: 3,
  })
  console.log(
    JSON.stringify(
      {
        ok: true,
        removed: { invoices, vouchers, claims, movementsRestored },
        countersDecremented: cnt.count,
        finalCounts: { invoices: invCount, stockMovements: mvCount, receiptVouchers: rcvCount },
        expected: { invoices: 165, stockMovements: 568, receiptVouchers: 133 },
        topStocks: stocks.map((s) => ({ name: s.product.name, qty: Number(s.qty) })),
        userDeactivated: EMAIL,
      },
      null,
      2
    )
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
