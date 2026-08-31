import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const users = await db.user.findMany({ select: { email: true, role: true, name: true } })
console.log(JSON.stringify(users, null, 2))
const counts = {
  invoices: await db.invoice.count(),
  sales: await db.invoice.count({ where: { type: 'SALE' } }),
  purchases: await db.invoice.count({ where: { type: 'PURCHASE' } }),
  vouchers: await db.voucher.count(),
  expenses: await db.expense.count(),
  movements: await db.stockMovement.count(),
}
console.log(JSON.stringify(counts, null, 2))
await db.$disconnect()
