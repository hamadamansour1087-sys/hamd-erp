import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, forbidden, unauthorized } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/** PUT /api/units/[id] { name?, shortName? } */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const { id } = await ctx.params
  const row0 = await db.unit.findFirst({ where: { id, orgId: s.orgId } })
  if (!row0) return bad('not-found', 404)
  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (typeof body.shortName === 'string') data.shortName = body.shortName
  const row = await db.unit.update({ where: { id }, data })
  return ok(row)
}

/** DELETE /api/units/[id] — staff only */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const row0 = await db.unit.findFirst({ where: { id, orgId: s.orgId } })
  if (!row0) return bad('not-found', 404)
  await db.unit.delete({ where: { id } })
  return ok({ id })
}
