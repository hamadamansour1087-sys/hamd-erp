import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, str, optStr, num, forbidden, unauthorized } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



async function getCustomer(orgId: string, id: string) {
  return db.customer.findFirst({ where: { id, orgId } })
}

/** GET /api/customers/[id] — profile + recent invoices + balance statement */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const { id } = await ctx.params
  const customer = await getCustomer(s.orgId, id)
  if (!customer) return bad('not-found', 404)
  const [invoices, receipts] = await Promise.all([
    db.invoice.findMany({
      where: { orgId: s.orgId, customerId: id, type: 'SALE' },
      orderBy: { date: 'desc' },
      take: 50,
      select: { id: true, number: true, date: true, total: true, paidAmount: true, status: true },
    }),
    db.voucher.aggregate({
      where: { orgId: s.orgId, customerId: id, invoiceId: null },
      _sum: { amount: true },
    }),
  ])
  const dues = invoices.reduce((sum, i) => sum + Math.max(0, i.total - i.paidAmount), 0)
  return ok({
    ...customer,
    owed: customer.openingBalance + dues - (receipts._sum.amount ?? 0),
    invoices,
    standaloneReceipts: receipts._sum.amount ?? 0,
  })
}

/** PUT /api/customers/[id] */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const { id } = await ctx.params
  const customer = await getCustomer(s.orgId, id)
  if (!customer) return bad('not-found', 404)
  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (str(body.name)) data.name = str(body.name)
  ;['phone', 'address', 'notes'].forEach((k) => {
    if (body[k] !== undefined) data[k] = optStr(body[k])
  })
  if (body.openingBalance !== undefined) data.openingBalance = num(body.openingBalance, 0)
  const row = await db.customer.update({ where: { id }, data })
  return ok(row)
}

/** DELETE /api/customers/[id] — staff only */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const customer = await getCustomer(s.orgId, id)
  if (!customer) return bad('not-found', 404)
  const used = await db.invoice.count({ where: { customerId: id } })
  if (used > 0) return bad('in-use')
  await db.customer.delete({ where: { id } })
  return ok({ id })
}

void num
