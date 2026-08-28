import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, forbidden, unauthorized, isFkViolation } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/** PUT /api/units/[id] { name?, shortName? } — staff only */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const row0 = await db.unit.findFirst({ where: { id, orgId: s.orgId } })
  if (!row0) return bad('not-found', 404)
  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 120)
  if (typeof body.shortName === 'string') data.shortName = body.shortName.slice(0, 30)
  await db.unit.updateMany({ where: { id, orgId: s.orgId }, data })
  return ok(await db.unit.findFirst({ where: { id, orgId: s.orgId } }))
}

/** DELETE /api/units/[id] — staff only */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const row0 = await db.unit.findFirst({ where: { id, orgId: s.orgId } })
  if (!row0) return bad('not-found', 404)
  try {
    await db.unit.deleteMany({ where: { id, orgId: s.orgId } })
  } catch (e) {
    // Race: a product referencing the unit landed after the pre-read — the FK
    // is the source of truth; map to 409 instead of a 500.
    if (isFkViolation(e)) return bad('in-use', 409)
    throw e
  }
  return ok({ id })
}
