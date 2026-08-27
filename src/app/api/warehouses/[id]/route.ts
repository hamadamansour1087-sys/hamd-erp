import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, str, optStr, forbidden, unauthorized } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/** PUT /api/warehouses/[id] — staff only; supports isDefault promotion */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const wh = await db.warehouse.findFirst({ where: { id, orgId: s.orgId } })
  if (!wh) return bad('not-found', 404)
  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (str(body.name)) data.name = str(body.name)
  ;['location', 'phone'].forEach((k) => {
    if (body[k] !== undefined) data[k] = optStr(body[k])
  })
  if (body.isDefault === true && !wh.isDefault) {
    await db.$transaction([
      db.warehouse.updateMany({ where: { orgId: s.orgId }, data: { isDefault: false } }),
      db.warehouse.updateMany({ where: { id, orgId: s.orgId }, data: { isDefault: true } }),
    ])
  }
  // Tenant-scoped write: the update matches on id + orgId so it can never cross tenants.
  const res = await db.warehouse.updateMany({ where: { id, orgId: s.orgId }, data })
  if (res.count === 0) return bad('not-found', 404)
  const row = await db.warehouse.findUnique({ where: { id } })
  return ok(row)
}

/** DELETE /api/warehouses/[id] — not allowed for the default warehouse or one holding stock/invoices */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const wh = await db.warehouse.findFirst({ where: { id, orgId: s.orgId } })
  if (!wh) return bad('not-found', 404)
  if (wh.isDefault) return bad('cannot-delete-default')
  const [inStock, inInvoices] = await Promise.all([
    db.stockLevel.count({ where: { warehouseId: id, qty: { gt: 0 }, warehouse: { orgId: s.orgId } } }),
    db.invoice.count({ where: { orgId: s.orgId, warehouseId: id } }),
  ])
  if (inStock > 0 || inInvoices > 0) return bad('in-use')
  await db.warehouse.deleteMany({ where: { id, orgId: s.orgId } })
  return ok({ id })
}
