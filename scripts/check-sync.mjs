import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const orgId = 'cmtalqc6t0000rmvp2xjrrjpg'
const inv = await db.invoice.findMany({
  where: { orgId, type: 'SALE' },
  orderBy: { number: 'desc' },
  take: 3,
  select: { id: true, number: true, total: true, paidAmount: true, status: true, clientOperationId: true, items: { select: { nameSnap: true, qty: true, price: true } } },
})
console.log(JSON.stringify(inv.map(i => ({ ...i, total: String(i.total), paidAmount: String(i.paidAmount), clientOperationId: i.clientOperationId?.slice(0, 20) })), null, 1))
const latest = inv[0]
if (latest) {
  const mv = await db.stockMovement.findMany({ where: { refId: latest.id }, select: { qty: true, kind: true } })
  const vc = await db.voucher.findMany({ where: { invoiceId: latest.id }, select: { type: true, amount: true, method: true, partyName: true, customerId: true } })
  const dupCount = await db.invoice.count({ where: { orgId, clientOperationId: latest.clientOperationId } })
  console.log('StockMovements:', JSON.stringify(mv))
  console.log('Vouchers:', JSON.stringify(vc.map(v => ({ ...v, amount: String(v.amount) }))))
  console.log('DUPLICATE-CHECK same clientOperationId count:', dupCount)
}
await db.$disconnect()
