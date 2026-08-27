import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, forbidden, unauthorized } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/** PUT /api/categories/[id] { name?, sort? } — rename / reorder */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const { id } = await ctx.params
  const cat = await db.category.findFirst({ where: { id, orgId: s.orgId } })
  if (!cat) return bad('not-found', 404)
  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (typeof body.sort === 'number') data.sort = body.sort
  const row = await db.category.update({ where: { id }, data })
  return ok(row)
}

/** DELETE /api/categories/[id] — staff only; products keep existing (SetNull) */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const cat = await db.category.findFirst({ where: { id, orgId: s.orgId } })
  if (!cat) return bad('not-found', 404)
  await db.category.delete({ where: { id } })
  return ok({ id })
}
