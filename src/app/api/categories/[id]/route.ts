import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, forbidden, unauthorized, readJson } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/** PUT /api/categories/[id] { name?, sort? } — rename / reorder (staff only) */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const cat = await db.category.findFirst({ where: { id, orgId: s.orgId } })
  if (!cat) return bad('not-found', 404)
  const body = await readJson(req)
  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 120)
  // Bounded safe integer — 1e10 would overflow the Int column (unhandled 500).
  if (typeof body.sort === 'number' && Number.isSafeInteger(body.sort) && body.sort >= 0 && body.sort <= 1_000_000) data.sort = body.sort
  await db.category.updateMany({ where: { id, orgId: s.orgId }, data })
  const row = await db.category.findFirst({ where: { id, orgId: s.orgId } })
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
  await db.category.deleteMany({ where: { id, orgId: s.orgId } })
  return ok({ id })
}
