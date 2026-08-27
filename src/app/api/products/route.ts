import { getSession } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized, boundedStr } from '@/lib/api-helpers'
import { ok, bad, str, optStr, num, money, round2 } from '@/lib/api-helpers'

/**
 * GET /api/products?q=&categoryId=&active=&page=&pageSize=
 */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const sp = req.nextUrl.searchParams
  const q = str(sp.get('q'))
  const categoryId = str(sp.get('categoryId'))
  const activeParam = sp.get('active')
  const page = Math.max(1, Math.floor(num(sp.get('page'), 1)))
  const pageSize = Math.min(200, Math.max(5, Math.floor(num(sp.get('pageSize'), 60))))

  const where: Record<string, unknown> = { orgId: s.orgId }
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { nameEn: { contains: q } },
      { barcode: { contains: q } },
      { sku: { contains: q } },
    ]
  }
  if (categoryId) where.categoryId = categoryId
  if (activeParam === '0' || activeParam === 'false') where.active = false
  else if (activeParam === '1' || activeParam === 'true') where.active = true

  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      include: {
        levels: { select: { warehouseId: true, qty: true } },
        category: { select: { name: true } },
        unit: { select: { name: true, shortName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return ok({
    total,
    page,
    pageSize,
    rows: rows.map((p) => ({
      ...p,
      categoryName: p.category?.name ?? null,
      unitName: p.unit?.name ?? null,
      unitShort: p.unit?.shortName ?? null,
      stock: p.levels.reduce((sum, l) => sum + l.qty, 0),
    })),
  })
}

/**
 * POST /api/products — create; supports initial opening qty per warehouse
 * body: { name, nameEn?, sku?, barcode?, categoryId?, unitId?, cost, price,
 *         minQty?, trackStock?, imageUrl?, notes?, openingQty?: [{warehouseId, qty}] }
 */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (s.role === 'CASHIER') return bad('forbidden', 403)
  const body = await req.json().catch(() => ({}))
  const name = boundedStr(body.name, 200)
  if (!name) return bad('name-required')

  const created = await db.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        orgId: s.orgId,
        name,
        nameEn: optStr(body.nameEn),
        sku: optStr(body.sku),
        barcode: optStr(body.barcode),
        categoryId: optStr(body.categoryId),
        unitId: optStr(body.unitId),
        // Money fields: finite, non-negative, rounded to 2dp (see docs/MONEY-AUDIT.md)
        cost: round2(money(body.cost, 0)),
        price: round2(money(body.price, 0)),
        minQty: round2(money(body.minQty, 0)),
        trackStock: body.trackStock !== false,
        imageUrl: optStr(body.imageUrl),
        notes: optStr(body.notes),
        active: body.active !== false,
      },
    })
    // optional opening quantities → StockLevel + ledger movements
    const openings: Array<{ warehouseId: string; qty: number }> = Array.isArray(body.openingQty)
      ? body.openingQty.filter((o: { warehouseId?: string }) => typeof o?.warehouseId === 'string')
      : []
    for (const o of openings) {
      const wh = await tx.warehouse.findFirst({ where: { id: o.warehouseId, orgId: s.orgId }, select: { id: true } })
      if (!wh) continue
      const qty = num(o.qty, 0)
      if (qty === 0) continue
      await tx.stockLevel.upsert({
        where: { productId_warehouseId: { productId: product.id, warehouseId: o.warehouseId } },
        create: { productId: product.id, warehouseId: o.warehouseId, qty },
        update: { qty: { increment: qty } },
      })
      await tx.stockMovement.create({
        data: {
          orgId: s.orgId,
          productId: product.id,
          warehouseId: o.warehouseId,
          qty,
          kind: 'OPENING',
          refType: 'OPENING',
          refId: product.id,
          note: 'رصيد افتتاحي للمنتج',
          userId: s.id,
        },
      })
    }
    return product
  })

  const withLevels = await db.product.findUnique({
    where: { id: created.id },
    include: { levels: { select: { warehouseId: true, qty: true } } },
  })
  return ok(withLevels)
}
