import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, str, optStr, boundedStr, forbidden, unauthorized, readJson, isFkViolation } from '@/lib/api-helpers'
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
  const body = await readJson(req)
  const data: Record<string, unknown> = {}
  if (str(body.name)) data.name = boundedStr(str(body.name), 200)
  ;['location', 'phone'].forEach((k) => {
    if (body[k] !== undefined) data[k] = boundedStr(optStr(body[k]), k === 'location' ? 500 : 100) || null
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
  // Tenant-scoped re-read: orgId in the WHERE (defense-in-depth — the write
  // above already matched id+orgId; the read must never trust that alone).
  const row = await db.warehouse.findFirst({ where: { id, orgId: s.orgId } })
  return ok(row)
}

/**
 * DELETE /api/warehouses/[id] — not allowed for the default warehouse or one
 * holding stock/invoices/transfer history.
 *
 * RACE-HARDENED: the usage counts are advisory (friendly 400). The FKs are the
 * source of truth — Invoice.warehouse and Transfer legs are ON DELETE RESTRICT,
 * so a referencing row landing between the count check and the delete makes the
 * delete hard-fail (mapped to 409) instead of silently nulling invoice
 * warehouse attribution or cascading transfer history away.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const wh = await db.warehouse.findFirst({ where: { id, orgId: s.orgId } })
  if (!wh) return bad('not-found', 404)
  if (wh.isDefault) return bad('cannot-delete-default')
  const [inStock, inInvoices, inTransfers] = await Promise.all([
    db.stockLevel.count({ where: { warehouseId: id, qty: { gt: 0 }, warehouse: { orgId: s.orgId } } }),
    db.invoice.count({ where: { orgId: s.orgId, warehouseId: id } }),
    db.transfer.count({ where: { orgId: s.orgId, OR: [{ fromWarehouseId: id }, { toWarehouseId: id }] } }),
  ])
  if (inStock > 0 || inInvoices > 0 || inTransfers > 0) return bad('in-use', 409)
  try {
    const del = await db.warehouse.deleteMany({ where: { id, orgId: s.orgId } })
    if (del.count === 0) return bad('not-found', 404)
  } catch (e) {
    // Concurrent reference landed after the counts — RESTRICT refused it.
    if (isFkViolation(e)) return bad('in-use', 409)
    throw e
  }
  return ok({ id })
}
