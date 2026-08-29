import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const o = await db.org.findFirst({ where: { name: 'SmokeFixCo' } })
  if (!o) { console.log('already gone'); return }
  const id = o.id
  // dependency-ordered cleanup (InvoiceItem→Product is Restrict by design)
  await db.invoiceItem.deleteMany({ where: { invoice: { orgId: id } } })
  await db.invoice.deleteMany({ where: { orgId: id } })
  await db.voucher.deleteMany({ where: { orgId: id } })
  await db.stockMovement.deleteMany({ where: { orgId: id } })
  await db.stockLevel.deleteMany({ where: { warehouse: { orgId: id } } })
  await db.transfer.deleteMany({ where: { orgId: id } })
  await db.expense.deleteMany({ where: { orgId: id } })
  await db.product.deleteMany({ where: { orgId: id } })
  await db.org.delete({ where: { id } })
  console.log('deleted')
  await db.$disconnect()
}
main()
