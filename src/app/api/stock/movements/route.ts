import { getSession } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized } from '@/lib/api-helpers'
import { ok, num, str } from '@/lib/api-helpers'

/** GET /api/stock/movements?warehouseId=&productId=&kind=&limit= */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const sp = req.nextUrl.searchParams
  const warehouseId = sp.get('warehouseId') || undefined
  const productId = sp.get('productId') || undefined
  const kind = str(sp.get('kind')) || undefined
  const limit = Math.min(500, Math.max(1, Math.floor(num(sp.get('limit'), 100))))

  const rows = await db.stockMovement.findMany({
    where: {
      orgId: s.orgId,
      ...(warehouseId ? { warehouseId } : {}),
      ...(productId ? { productId } : {}),
      ...(kind ? { kind } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      product: { select: { name: true, barcode: true } },
    },
  })

  // resolve warehouse names in a single query
  const whIds = Array.from(new Set(rows.map((r) => r.warehouseId)))
  const whs = whIds.length
    ? await db.warehouse.findMany({ where: { orgId: s.orgId, id: { in: whIds } }, select: { id: true, name: true } })
    : []
  const wmap = new Map(whs.map((w) => [w.id, w.name]))

  return ok(
    rows.map((m) => ({
      id: m.id,
      productId: m.productId,
      productName: m.product?.name ?? '-',
      barcode: m.product?.barcode ?? null,
      warehouseId: m.warehouseId,
      warehouseName: wmap.get(m.warehouseId) ?? '-',
      qty: m.qty,
      kind: m.kind,
      refType: m.refType,
      refId: m.refId,
      note: m.note,
      createdAt: m.createdAt.toISOString(),
    }))
  )
}
