import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, unauthorized, forbidden, InsufficientStockError, OperationConflictError, withDbRetry } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/** GET /api/invoices/[id] — full detail for the view/print pages */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const { id } = await ctx.params
  const inv = await db.invoice.findFirst({
    where: { id, orgId: s.orgId },
    include: {
      items: true,
      customer: { select: { name: true, phone: true, address: true } },
      supplier: { select: { name: true, phone: true, address: true } },
      warehouse: { select: { name: true } },
      user: { select: { name: true } },
      vouchers: {
        orderBy: { date: 'asc' },
        select: { id: true, number: true, amount: true, method: true, date: true },
      },
    },
  })
  if (!inv) return bad('not-found', 404)
  return ok({
    id: inv.id,
    number: inv.number,
    type: inv.type,
    status: inv.status,
    date: inv.date.toISOString(),
    dueDate: inv.dueDate?.toISOString() ?? null,
    partyName: inv.customer?.name ?? inv.supplier?.name ?? null,
    customerPhone: inv.customer?.phone ?? null,
    supplierPhone: inv.supplier?.phone ?? null,
    address: inv.customer?.address ?? inv.supplier?.address ?? null,
    warehouseId: inv.warehouseId,
    warehouseName: inv.warehouse?.name ?? null,
    createdBy: inv.user?.name ?? null,
    subtotal: inv.subtotal,
    discount: inv.discount,
    taxPercent: inv.taxPercent,
    taxAmount: inv.taxAmount,
    total: inv.total,
    paidAmount: inv.paidAmount,
    costTotal: inv.costTotal,
    notes: inv.notes,
    items: inv.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      nameSnap: it.nameSnap,
      unitSnap: it.unitSnap,
      barcodeSnap: it.barcodeSnap,
      qty: it.qty,
      price: it.price,
      costAtSale: it.costAtSale,
      total: it.total,
    })),
    vouchers: inv.vouchers,
  })
}

/**
 * DELETE /api/invoices/[id] — staff cancels an invoice.
 *
 * BUSINESS RULES (explicit, documented):
 *  1. Stock: SALE → quantities restored to the warehouse; PURCHASE → purchased
 *     quantities removed. Every reversal is written to StockMovement with
 *     kind SALE_CANCEL / PURCHASE_CANCEL + refId for a full audit trail.
 *  2. Cost (PURCHASE only): product.cost is reverted to the price of the most
 *     recent NON-CANCELLED purchase before this one. If no earlier purchase
 *     exists, cost is left as-is (preserves any manual baseline cost).
 *  3. Payment vouchers: EXISTING vouchers are KEPT (never silently deleted —
 *     they represent money that physically moved). Consequences:
 *     - cash report (cashInHand) still counts them — deliberate, the cash is real.
 *     - party balances: vouchers linked to a CANCELLED invoice are counted as
 *       party CREDIT (advance/overpaid) in partyDues() — so receivables/payables
 *       stay consistent with the cash report.
 *  4. Profit/sales reports exclude CANCELLED invoices entirely.
 *  5. paidAmount on the cancelled invoice is preserved as history; the invoice
 *     is excluded from all aggregated reports.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const inv = await db.invoice.findFirst({
    where: { id, orgId: s.orgId },
    include: { items: true },
  })
  if (!inv) return bad('not-found', 404)
  if (inv.status === 'CANCELLED') return bad('already-cancelled')

  const whId = inv.warehouseId
  if (!whId) return bad('warehouse-missing')

  // Server-side negative-stock policy (org setting, default true). A PURCHASE
  // cancel REMOVES the received goods from stock (delta negative) — when the
  // admin disabled negative stock and the goods were already sold, the cancel
  // is rejected atomically instead of silently driving stock below zero.
  const allowNegativeStock =
    (await db.org.findUnique({ where: { id: s.orgId }, select: { allowNegativeStock: true } }))
      ?.allowNegativeStock ?? true

  try {
    await withDbRetry(() =>
      db.$transaction(async (tx) => {
    for (const it of inv.items) {
      const product = await tx.product.findFirst({ where: { id: it.productId, orgId: s.orgId }, select: { trackStock: true } })
      if (!product?.trackStock) continue
      const delta = inv.type === 'SALE' ? it.qty : -it.qty // restore on sale-cancel / remove on purchase-cancel
      if (inv.type === 'PURCHASE' && !allowNegativeStock) {
        // ATOMIC negative-stock guard: WHERE (qty >= requested) is part of
        // the UPDATE — no read-then-write race; 0 rows ⇒ 409, tx rolls back.
        const cas = await tx.stockLevel.updateMany({
          where: { productId: it.productId, warehouseId: whId, qty: { gte: it.qty } },
          data: { qty: { decrement: it.qty } },
        })
        if (cas.count === 0) throw new InsufficientStockError()
      } else {
        await tx.stockLevel.upsert({
          where: { productId_warehouseId: { productId: it.productId, warehouseId: whId } },
          create: { productId: it.productId, warehouseId: whId, qty: delta },
          update: { qty: { increment: delta } },
        })
      }
      await tx.stockMovement.create({
        data: {
          orgId: s.orgId,
          productId: it.productId,
          warehouseId: whId,
          qty: delta,
          kind: `${inv.type}_CANCEL`,
          refType: 'INVOICE',
          refId: inv.id,
          note: `إلغاء الفاتورة رقم ${inv.number}`,
          userId: s.id,
        },
      })
    }

    // PURCHASE cancel → revert product cost to the previous non-cancelled
    // purchase price (business rule #2 above; keeps historical audit intact).
    if (inv.type === 'PURCHASE') {
      for (const it of inv.items) {
        const prev = await tx.invoiceItem.findFirst({
          where: {
            productId: it.productId,
            invoice: { orgId: s.orgId, type: 'PURCHASE', status: { not: 'CANCELLED' }, id: { not: inv.id } },
          },
          orderBy: [{ invoice: { date: 'desc' } }, { invoice: { number: 'desc' } }],
          select: { price: true },
        })
        if (prev) {
          await tx.product.updateMany({ where: { id: it.productId, orgId: s.orgId }, data: { cost: prev.price } })
        }
      }
    }

    // Tenant-scoped write WITH THE CANCEL GUARD: `status: { not: 'CANCELLED' }`
    // in the WHERE makes the cancel idempotent under concurrency — a second
    // concurrent cancel (or a network replay racing the first) matches 0 rows
    // and ROLLS BACK its stock reversal instead of restoring quantities twice.
    // (The pre-check above is advisory only; this is the source of truth.)
    const cancelled = await tx.invoice.updateMany({
      where: { id: inv.id, orgId: s.orgId, status: { not: 'CANCELLED' } },
      data: { status: 'CANCELLED' },
    })
    if (cancelled.count === 0) throw new OperationConflictError('already-cancelled')
  })
    )
  } catch (e) {
    if (e instanceof InsufficientStockError) return bad('insufficient-stock', 409)
    if (e instanceof OperationConflictError) return bad(e.message, 409)
    throw e
  }

  return ok({ id, status: 'CANCELLED' })
}
