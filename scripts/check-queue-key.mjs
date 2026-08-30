import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const orgId = 'cmtalqc6t0000rmvp2xjrrjpg'
const RAW_KEY = process.argv[2] ?? 'ek559296mjnmtf6r3rs'
const scoped = `invoice:${createHash('sha256').update(RAW_KEY).digest('hex')}`

const claim = await db.idempotencyKey.findUnique({
  where: { orgId_key: { orgId, key: scoped } },
  select: { resultId: true, userId: true },
})
console.log('CLAIM for queue-key:', claim ? JSON.stringify({ resultId: claim.resultId, owner: claim.userId.slice(0, 8) }) : 'NULL (not synced yet)')

if (claim?.resultId) {
  const inv = await db.invoice.findUnique({ where: { id: claim.resultId }, select: { id: true, number: true, total: true, paidAmount: true, status: true, clientOperationId: true } })
  console.log('SYNCED-INVOICE:', JSON.stringify({ number: inv.number, total: String(inv.total), paidAmount: String(inv.paidAmount), status: inv.status }))
  const dup = await db.invoice.count({ where: { orgId, clientOperationId: scoped } })
  console.log('STEP16 same-clientOperationId count:', dup, dup === 1 ? 'EXACTLY-ONCE OK' : 'DUPLICATE!')
  const mv = await db.stockMovement.findMany({ where: { refId: inv.id }, select: { qty: true, kind: true, refType: true } })
  console.log('STEP17 StockMovements:', JSON.stringify(mv.map(m => ({ qty: String(m.qty), kind: m.kind, refType: m.refType }))))
  const vc = await db.voucher.findMany({ where: { invoiceId: inv.id }, select: { type: true, amount: true, method: true, customerId: true, partyName: true } })
  console.log('STEP18 Payments:', JSON.stringify(vc.map(v => ({ type: v.type, amount: String(v.amount), method: v.method, customerId: v.customerId, partyName: v.partyName }))))
}
const newest = await db.invoice.findMany({
  where: { orgId, type: 'SALE' },
  orderBy: { number: 'desc' },
  take: 2,
  select: { number: true, total: true, status: true },
})
console.log('NEWEST-SALES:', JSON.stringify(newest.map(i => ({ number: i.number, total: String(i.total), status: i.status }))))
await db.$disconnect()
