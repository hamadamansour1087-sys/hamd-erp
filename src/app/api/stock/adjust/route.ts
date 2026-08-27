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
  isUniqueViolation,
} from '@/lib/api-helpers'

/**
 * In-process keyed mutex — serializes stock adjustments per (product, warehouse).
 * SQLite allows a single writer; concurrent interactive transactions would
 * otherwise queue on the database write lock (and can exceed Prisma's 5s
 * transaction timeout under burst). The mutex removes the contention in this
 * single-process deployment; the CAS retry inside remains the correctness
 * backstop (e.g. multiple worker processes) and guarantees the ledger can
 * never diverge from StockLevel.qty.
 */
const stockLocks = new Map<string, Promise<unknown>>()
async function withStockLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = stockLocks.get(key) ?? Promise.resolve()
  const next = prev.catch(() => undefined).then(fn)
  stockLocks.set(key, next)
  try {
    return await next
  } finally {
    if (stockLocks.get(key) === next) stockLocks.delete(key)
  }
}

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
  const adjusted = await withStockLock(`${productId}:${warehouseId}`, () => db.$transaction(async (tx) => {
    // CONCURRENCY: compare-and-swap (CAS) retry loop. The delta is computed from
    // a qty that is re-read INSIDE the write transaction, and the absolute set is
    // applied only while the row still holds that observed qty (`qty: oldQty` in
    // the WHERE). A concurrent adjustment between read and write makes the CAS
    // match 0 rows → retry recomputes from the fresh value. This makes a lost
    // update impossible: StockLevel.qty can never diverge from the sum of
    // StockMovement deltas produced here.
    for (let attempt = 0; ; attempt++) {
      const existing = await tx.stockLevel.findUnique({
        where: { productId_warehouseId: { productId, warehouseId } },
        select: { qty: true },
      })
      const oldQty = existing?.qty ?? 0
      const delta = round2(newQty - oldQty)
      if (delta === 0) {
        return { changed: false as const, oldQty, newQty }
      }
      if (existing) {
        const cas = await tx.stockLevel.updateMany({
          where: { productId, warehouseId, qty: oldQty },
          data: { qty: newQty },
        })
        if (cas.count === 1) {
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
        }
      } else {
        // Row does not exist yet — create it; a concurrent creator would violate
        // the (productId, warehouseId) unique constraint → retry re-reads.
        try {
          await tx.stockLevel.create({ data: { productId, warehouseId, qty: newQty } })
        } catch (e) {
          if (isUniqueViolation(e) && attempt < 5) continue
          throw e
        }
        await tx.stockMovement.create({
          data: {
            orgId: s.orgId,
            productId,
            warehouseId,
            qty: delta,
            kind: 'ADJUST_IN',
            refType: 'ADJUSTMENT',
            refId: null,
            note: reason ?? `تسوية جرد من ${oldQty} إلى ${newQty} (${product.name})`,
            userId: s.id,
          },
        })
        return { changed: true as const, oldQty, newQty }
      }
      if (attempt >= 5) throw new Error('stock-qty-conflict')
    }
    })
  )
  // Synthetic id so idempotent replays resolve to this operation.
  return { id: `adjust:${productId}:${warehouseId}`, ...adjusted, productId, warehouseId }
  })

  return okIdempotent(result)
}
