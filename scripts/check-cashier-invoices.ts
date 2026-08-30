/** Check invoices created by the offline-e2e cashier (sync verification). */
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const invs = await db.invoice.findMany({
  where: { user: { email: 'offline-e2e@hamd.test' } },
  orderBy: { id: 'desc' },
  take: 3,
  select: { id: true, total: true, status: true, date: true, number: true, items: { select: { qty: true, price: true } } },
})
console.log(JSON.stringify(invs, null, 1))
await db.$disconnect()
