import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, round2, unauthorized, forbidden } from '@/lib/api-helpers'
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

  await db.$transaction(async (tx) => {
    if (voucher.invoiceId) {
      const inv = await tx.invoice.findUnique({
        where: { id: voucher.invoiceId },
        select: { paidAmount: true, total: true, status: true },
      })
      if (inv && inv.status !== 'CANCELLED') {
        const newPaid = round2(Math.max(0, Math.min(inv.total, inv.paidAmount - voucher.amount)))
        const status = newPaid <= 0 ? 'UNPAID' : newPaid >= inv.total ? 'PAID' : 'PARTIAL'
        await tx.invoice.update({ where: { id: voucher.invoiceId }, data: { paidAmount: newPaid, status } })
      }
    }
    await tx.voucher.delete({ where: { id } })
  })

  return ok({ id })
}
