import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, str, optStr, num, forbidden, unauthorized } from '@/lib/api-helpers'
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

  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  const setIf = (keys: string[], transform: (v: unknown) => unknown = (v) => v) => {
    for (const k of keys) {
      if (body[k] !== undefined && body[k] !== null) data[k] = transform(body[k])
    }
  }
  if (str(body.name)) data.name = str(body.name)
  setIf(['nameEn', 'sku', 'barcode', 'imageUrl', 'notes'], (v) => optStr(v))
  setIf(['categoryId', 'unitId'], (v) => optStr(v))
  setIf(['cost', 'price', 'minQty'], (v) => num(v, 0))
  if (body.trackStock !== undefined) data.trackStock = !!body.trackStock
  if (body.active !== undefined) data.active = !!body.active

  const row = await db.product.update({ where: { id }, data, include: { levels: true } })
  return ok(row)
}

/** DELETE /api/products/[id] — soft delete (deactivate); hard delete allowed when unused */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const existing = await db.product.findFirst({
    where: { id, orgId: s.orgId },
    include: { _count: { select: { items: true } } },
  })
  if (!existing) return bad('not-found', 404)

  if (existing._count.items > 0) {
    await db.product.update({ where: { id }, data: { active: false } })
    return ok({ id, deactivated: true })
  }
  await db.product.delete({ where: { id } })
  return ok({ id, deactivated: false })
}
