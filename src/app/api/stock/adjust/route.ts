import { getSession, isStaff } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized } from '@/lib/api-helpers'
import {
  ok,
  bad,
  str,
  optStr,
  round2,
  forbidden,
  withIdempotency,
  okIdempotent,
} from '@/lib/api-helpers'

/**
 * POST /api/stock/adjust — physical count correction (staff only).
 * body { warehouseId, productId, newQty, reason? }
 * Records an ADJUST_IN / ADJUST_OUT ledger movement with the delta.
 */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  // Authorization (server-side): stock adjustments are a management operation.
  if (!isStaff(s)) return forbidden()
  const body = await req.json().catch(() => ({}))
  const warehouseId = str(body.warehouseId)
  const productId = str(body.productId)
  if (!warehouseId || !productId) return bad('missing-fields')

  const [wh, product] = await Promise.all([
    db.warehouse.findFirst({ where: { id: warehouseId, orgId: s.orgId }, select: { id: true } }),
    db.product.findFirst({ where: { id: productId, orgId: s.orgId }, select: { id: true, name: true } }),
  ])
  if (!wh || !product) return bad('not-found', 404)

  if (body.newQty === undefined || body.newQty === null) return bad('qty-invalid')
  const newQty = round2(Number(body.newQty))
  if (!Number.isFinite(newQty) || newQty < 0) return bad('qty-invalid')
  const reason = optStr(body.reason)

  const result = await withIdempotency(req, s, 'stock-adjust', async () => {
  const adjusted = await db.$transaction(async (tx) => {
    const existing = await tx.stockLevel.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
      select: { qty: true },
    })
    const oldQty = existing?.qty ?? 0
    const delta = round2(newQty - oldQty)
    if (delta === 0) {
      return { changed: false as const, oldQty, newQty }
    }
    await tx.stockLevel.upsert({
      where: { productId_warehouseId: { productId, warehouseId } },
      create: { productId, warehouseId, qty: newQty },
      update: { qty: newQty },
    })
    await tx.stockMovement.create({
      data: {
        orgId: s.orgId,
        productId,
        warehouseId,
        qty: delta,
        kind: delta > 0 ? 'ADJUST_IN' : 'ADJUST_OUT',
        refType: 'ADJUSTMENT',
        refId: null,
        note: reason ?? `تسوية جرد من ${oldQty} إلى ${newQty} (${product.name})`,
        userId: s.id,
      },
    })
    return { changed: true as const, oldQty, newQty }
  })
  // Synthetic id so idempotent replays resolve to this operation.
  return { id: `adjust:${productId}:${warehouseId}`, ...adjusted, productId, warehouseId }
  })

  return okIdempotent(result)
}
