import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, unauthorized, forbidden } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/** DELETE /api/expenses/[id] — staff only */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const row = await db.expense.findFirst({ where: { id, orgId: s.orgId } })
  if (!row) return bad('not-found', 404)
  await db.expense.delete({ where: { id } })
  return ok({ id })
}
