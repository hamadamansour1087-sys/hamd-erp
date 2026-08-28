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

type AdjustOutcome = {
  id: string
  changed: boolean
  alreadyApplied: boolean
  oldQty: number
  newQty: number
}

/** Resolve the committed state of an already-applied adjustment (crash recovery). */
async function committedOutcome(
  orgId: string,
  productId: string,
  warehouseId: string,
  clientOpId: string
): Promise<AdjustOutcome | null> {
  const movement = await db.stockMovement.findUnique({
    where: { orgId_clientOperationId: { orgId, clientOperationId: clientOpId } },
    select: { id: true, qty: true },
  })
  if (!movement) return null
  const level = await db.stockLevel.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
    select: { qty: true },
  })
  const cur = Number(level?.qty ?? 0)
  return {
    id: movement.id,
    changed: true,
    alreadyApplied: true,
    oldQty: round2(cur - Number(movement.qty)),
    newQty: cur,
  }
}

/**
 * POST /api/stock/adjust — physical count correction (staff only).
 * body { warehouseId, productId, newQty, reason? }
 * Records an ADJUST_IN / ADJUST_OUT ledger movement with the delta.
 *
 * CRASH-SAFE IDEMPOTENCY (same level as Invoice/Voucher/Transfer): when the
 * client sends an `Idempotency-Key`, the scoped key is embedded as
 * `clientOperationId` ON the StockMovement, inside the SAME transaction that
 * writes StockLevel (@@unique([orgId, clientOperationId])). If the server
 * crashes after the COMMIT but before IdempotencyKey.resultId is recorded,
 * the retry finds the committed movement and returns it untouched — a second
 * StockMovement, a second StockLevel change, or a re-applied absolute set
 * (which could silently revert a legitimate later adjustment) are all
 * impossible in every interleaving.
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

  const result = await withIdempotency(req, s, 'stock-adjust', async (clientOpId) => {
  const adjusted = await withStockLock(`${productId}:${warehouseId}`, async (): Promise<AdjustOutcome> => {
    let lastError: unknown
    for (let txTry = 0; txTry < 3; txTry++) {
      try {
      return await db.$transaction(async (tx) => {
        // CRASH-WINDOW DEDUPE (pre-check): if a previous attempt of THIS
        // logical operation already committed its movement, it is already
        // applied — return it without touching StockLevel, even if other
        // adjustments legitimately moved the level after the crash.
        if (clientOpId) {
          const movement = await tx.stockMovement.findUnique({
            where: { orgId_clientOperationId: { orgId: s.orgId, clientOperationId: clientOpId } },
            select: { id: true, qty: true },
          })
          if (movement) {
            const level = await tx.stockLevel.findUnique({
              where: { productId_warehouseId: { productId, warehouseId } },
              select: { qty: true },
            })
            const cur = Number(level?.qty ?? 0)
            return {
              id: movement.id,
              changed: true,
              alreadyApplied: true,
              oldQty: round2(cur - Number(movement.qty)),
              newQty: cur,
            }
          }
        }
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
          const oldQty = Number(existing?.qty ?? 0)
          const delta = round2(newQty - oldQty)
          if (delta === 0) {
            // Genuine no-op (nothing was ever applied for this key): the
            // synthetic id is safe here — there is no document to duplicate.
            return { id: `adjust:${productId}:${warehouseId}`, changed: false, alreadyApplied: false, oldQty, newQty }
          }
          if (existing) {
            const cas = await tx.stockLevel.updateMany({
              where: { productId, warehouseId, qty: oldQty },
              data: { qty: newQty },
            })
            if (cas.count === 1) {
              const movement = await tx.stockMovement.create({
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
                  // CRASH-WINDOW ANCHOR: committed atomically with the
                  // StockLevel write above; @@unique([orgId, clientOperationId])
                  // makes a duplicate operation impossible.
                  clientOperationId: clientOpId,
                },
                select: { id: true },
              })
              return { id: movement.id, changed: true, alreadyApplied: false, oldQty, newQty }
            }
          } else {
            // Row does not exist yet — create it; a concurrent creator would violate
            // the (productId, warehouseId) unique constraint → retry re-reads.
            await tx.stockLevel.create({ data: { productId, warehouseId, qty: newQty } })
            const movement = await tx.stockMovement.create({
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
                clientOperationId: clientOpId,
              },
              select: { id: true },
            })
            return { id: movement.id, changed: true, alreadyApplied: false, oldQty, newQty }
          }
          if (attempt >= 5) throw new Error('stock-qty-conflict')
        }
      })
      } catch (e) {
        lastError = e
        // BACKSTOP (PostgreSQL-safe): the tx (including its StockLevel write)
        // has been rolled back — a P2002 aborts a PostgreSQL transaction, so
        // in-transaction retries are impossible; retries happen HERE with
        // fresh reads (CAS recomputes the delta).
        if (clientOpId && isUniqueViolation(e, 'clientOperationId')) {
          const outcome = await committedOutcome(s.orgId, productId, warehouseId, clientOpId)
          if (outcome) return outcome
        }
        if (isUniqueViolation(e) && txTry < 2) continue
        throw e
      }
    }
    throw lastError
  })
  return adjusted
  })

  return okIdempotent(result)
}
