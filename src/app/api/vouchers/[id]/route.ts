import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, round2, unauthorized, forbidden, OperationConflictError } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/** DELETE /api/vouchers/[id] — staff only. Reverses applied invoice paid amounts when linked. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const voucher = await db.voucher.findFirst({ where: { id, orgId: s.orgId } })
  if (!voucher) return bad('not-found', 404)

  try {
    await db.$transaction(async (tx) => {
      if (voucher.invoiceId) {
        // Compare-and-swap reversal (mirrors vouchers POST): re-read paidAmount
        // AND status inside the write transaction and only apply when both are
        // unchanged. Without CAS, two concurrent deletes of two vouchers on the
        // same invoice both read the same paidAmount and last-write-wins — one
        // reversal silently vanishes and the invoice stays overpaid.
        for (let attempt = 0; ; attempt++) {
          const inv = await tx.invoice.findFirst({
            where: { id: voucher.invoiceId, orgId: s.orgId },
            select: { id: true, paidAmount: true, total: true, status: true },
          })
          if (!inv || inv.status === 'CANCELLED') break // nothing to reverse
          const newPaid = round2(Math.max(0, Math.min(Number(inv.total), Number(inv.paidAmount) - Number(voucher.amount))))
          const status = newPaid <= 0 ? 'UNPAID' : newPaid >= Number(inv.total) ? 'PAID' : 'PARTIAL'
          const upd = await tx.invoice.updateMany({
            where: { id: inv.id, orgId: s.orgId, paidAmount: inv.paidAmount, status: { not: 'CANCELLED' } },
            data: { paidAmount: newPaid, status },
          })
          if (upd.count === 1) break
          if (attempt >= 10) throw new OperationConflictError('paid-amount-conflict')
        }
      }
      // Tenant-scoped write: delete matches on id + orgId. A concurrent delete
      // of the SAME voucher lands here as count 0 — the reversal above either
      // never ran (invoice gone/cancelled) or is rolled back with the tx.
      const del = await tx.voucher.deleteMany({ where: { id, orgId: s.orgId } })
      if (del.count === 0) throw new OperationConflictError('voucher-gone')
    })
  } catch (e) {
    if (e instanceof OperationConflictError && e.message === 'voucher-gone') return bad('not-found', 404)
    if (e instanceof OperationConflictError) return bad(e.message, 409)
    throw e
  }

  return ok({ id })
}
