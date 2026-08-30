import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const orgId = 'cmtalqc6t0000rmvp2xjrrjpg'
const inv = await db.invoice.findFirst({
  where: { orgId, type: 'SALE', number: 151 },
  select: { id: true, number: true, total: true, paidAmount: true, status: true, clientOperationId: true },
})
console.log('INVOICE-151:', JSON.stringify({ ...inv, total: String(inv.total), paidAmount: String(inv.paidAmount), clientOp: inv.clientOperationId?.slice(0, 24) }))
const dup = await db.invoice.count({ where: { orgId, clientOperationId: inv.clientOperationId } })
console.log('STEP16 duplicates with same clientOperationId:', dup, dup === 1 ? '(EXACTLY-ONCE ✓)' : '(DUPLICATE ✗)')
const mv = await db.stockMovement.findMany({ where: { refId: inv.id }, select: { qty: true, kind: true, refType: true } })
console.log('STEP17 StockMovements:', JSON.stringify(mv.map(m => ({ qty: String(m.qty), kind: m.kind, refType: m.refType }))))
const vc = await db.voucher.findMany({ where: { invoiceId: inv.id }, select: { type: true, amount: true, method: true, customerId: true, partyName: true } })
console.log('STEP18 Payments:', JSON.stringify(vc.map(v => ({ type: v.type, amount: String(v.amount), method: v.method, customerId: v.customerId, partyName: v.partyName }))))
const cust = await db.customer.findFirst({ where: { orgId, name: 'عميل نقدي' } })
const custInvs = await db.invoice.count({ where: { orgId, customerId: cust?.id } })
console.log('STEP19 cash-customer invoices:', custInvs, '| customer id:', cust?.id ?? 'cash-sale(no customer FK)')
const claim = await db.idempotencyKey.findUnique({ where: { orgId_key: { orgId, key: inv.clientOperationId } }, select: { resultId: true, userId: true } })
console.log('CLAIM:', JSON.stringify({ resultIdMatches: claim?.resultId === inv.id, hasOwner: !!claim?.userId }))
await db.$disconnect()
