import { getSession, hashPassword } from '@/lib/auth'
import { ok, bad, str, unauthorized, forbidden } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/**
 * PUT /api/users/[id] — ADMIN manages a user.
 * body { name?, role?, active?, password? } — self-demotion/lockout blocked.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (s.role !== 'ADMIN') return forbidden()
  const { id } = await ctx.params
  const target = await db.user.findFirst({ where: { id, orgId: s.orgId } })
  if (!target) return bad('not-found', 404)

  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  if (str(body.name)) data.name = str(body.name)

  if (body.role !== undefined) {
    const role = str(body.role)
    if (!['ADMIN', 'MANAGER', 'CASHIER'].includes(role)) return bad('invalid-role')
    if (target.id === s.id && role !== 'ADMIN') return bad('cannot-demote-self')
    data.role = role
  }

  if (body.active !== undefined) {
    const active = !!body.active
    if (target.id === s.id && !active) return bad('cannot-deactivate-self')
    data.active = active
  }

  // Password change or deactivation must invalidate the target's existing sessions.
  let revokeSessions = false
  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < 6) return bad('weak-password')
    data.passwordHash = hashPassword(body.password)
    revokeSessions = true
  }
  if (body.active !== undefined && data.active === false) revokeSessions = true
  if (revokeSessions) data.tokenVersion = { increment: 1 }

  // Tenant-scoped write: `updateMany` matches on id + orgId so the mutation can
  // never touch another tenant's user, even if `target` went stale above.
  const updated = await db.user.updateMany({
    where: { id, orgId: s.orgId },
    data,
  })
  if (updated.count === 0) return bad('not-found', 404)
  const row = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  })
  return ok(row)
}
