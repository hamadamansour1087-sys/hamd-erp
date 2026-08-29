import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, str, optStr, boundedStr, money, round2, forbidden, unauthorized, isFkViolation, isUniqueViolation, readJson } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/** GET /api/products/[id] — full detail incl. per-warehouse levels + last movements */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const { id } = await ctx.params
  const product = await db.product.findFirst({
    where: { id, orgId: s.orgId },
    include: {
      levels: { include: { warehouse: { select: { name: true } } } },
      category: { select: { name: true } },
      unit: { select: { name: true, shortName: true } },
    },
  })
  if (!product) return bad('not-found', 404)
  const movements = await db.stockMovement.findMany({
    where: { orgId: s.orgId, productId: id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  return ok({ ...product, movements })
}

/** PUT /api/products/[id] — update core fields */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (s.role === 'CASHIER') return forbidden()
  const { id } = await ctx.params
  const existing = await db.product.findFirst({ where: { id, orgId: s.orgId } })
  if (!existing) return bad('not-found', 404)

  const body = await readJson(req)
  const data: Record<string, unknown> = {}
  const setIf = (keys: string[], transform: (v: unknown) => unknown = (v) => v) => {
    for (const k of keys) {
      if (body[k] !== undefined && body[k] !== null) data[k] = transform(body[k])
    }
  }
  if (str(body.name)) data.name = boundedStr(str(body.name), 200)
  setIf(['nameEn', 'sku', 'barcode', 'imageUrl', 'notes'], (v) =>
    boundedStr(optStr(v), 2048) || null
  )
  setIf(['categoryId', 'unitId'], (v) => optStr(v))
  setIf(['cost', 'price', 'minQty'], (v) => round2(money(v, 0)))
  if (body.trackStock !== undefined) data.trackStock = !!body.trackStock
  if (body.active !== undefined) data.active = !!body.active

  // TENANT-SAFETY (was missing — the cross-tenant reference hole): PUT is the
  // only product write that let categoryId/unitId point at ANOTHER ORG's
  // rows (the FK alone accepts any id — existence ≠ ownership). POST already
  // validates; PUT now does too, for exactly the same reason.
  if (typeof data.categoryId === 'string') {
    const cat = await db.category.findFirst({
      where: { id: data.categoryId, orgId: s.orgId },
      select: { id: true },
    })
    if (!cat) return bad('category-not-found')
  }
  if (typeof data.unitId === 'string') {
    const unit = await db.unit.findFirst({
      where: { id: data.unitId, orgId: s.orgId },
      select: { id: true },
    })
    if (!unit) return bad('unit-not-found')
  }

  try {
    const row = await db.product.updateMany({ where: { id, orgId: s.orgId }, data })
    if (row.count === 0) return bad('not-found', 404)
  } catch (e) {
    // UNIQUE(orgId, barcode/sku) raced or was violated by this update —
    // surface a friendly 400 (POST already did; PUT was an unhandled 500).
    if (isUniqueViolation(e)) return bad('duplicate-sku-or-barcode')
    throw e
  }
  const fresh = await db.product.findFirst({
    where: { id, orgId: s.orgId },
    include: { levels: true },
  })
  return ok(fresh)
}

/** DELETE /api/products/[id] — soft delete (deactivate); hard delete allowed when unused */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const existing = await db.product.findFirst({
    where: { id, orgId: s.orgId },
    include: { _count: { select: { items: true, levels: true } } },
  })
  if (!existing) return bad('not-found', 404)

  // Referenced by invoice items OR still holding stock levels → deactivate only.
  if (existing._count.items > 0 || existing._count.levels > 0) {
    await db.product.updateMany({ where: { id, orgId: s.orgId }, data: { active: false } })
    return ok({ id, deactivated: true })
  }
  try {
    await db.product.deleteMany({ where: { id, orgId: s.orgId } })
  } catch (e) {
    // Race: an invoice/stock row referencing the product landed between the
    // count and the delete — keep the FK as the source of truth, return 409.
    if (isFkViolation(e)) return bad('in-use', 409)
    throw e
  }
  return ok({ id, deactivated: false })
}
