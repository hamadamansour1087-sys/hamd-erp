import { getSession, hashPasswordAsync } from '@/lib/auth'
import { ok, bad, str, unauthorized, forbidden, isUniqueViolation, OperationConflictError } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

// In-process serialization for admin-role mutations (same pattern as the stock
// keyed mutex): SQLite deferred transactions pin a read snapshot at the first
// read, so two concurrent demotions could BOTH pass a count-only guard (each
// sees the other admin still active). The per-org mutex makes the
// pre-check→write→recheck sequence atomic in the single-instance deployment;
// the in-transaction recount stays as the correctness backstop.
const adminLocks = new Map<string, Promise<unknown>>()
async function withAdminLock<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  const prev = adminLocks.get(orgId) ?? Promise.resolve()
  const next = prev.catch(() => undefined).then(fn)
  adminLocks.set(orgId, next)
  try {
    return await next
  } finally {
    if (adminLocks.get(orgId) === next) adminLocks.delete(orgId)
  }
}



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
    data.passwordHash = await hashPasswordAsync(body.password)
    revokeSessions = true
  }
  if (body.active !== undefined && data.active === false) revokeSessions = true
  if (revokeSessions) data.tokenVersion = { increment: 1 }

  // LAST-ADMIN GUARD (race-safe): demoting or deactivating the org's only
  // active ADMIN would lock the tenant out of user management/exports forever
  // (two admins de-admining each other concurrently = zero admins). The count
  // and the write run inside ONE transaction — SQLite serializes write
  // transactions, so a concurrent demotion can never slip between the check
  // and the write and leave the org with zero admins.
  const removesAdminRole =
    target.role === 'ADMIN' &&
    target.active &&
    ((body.role !== undefined && str(body.role) !== 'ADMIN') || data.active === false)
  try {
    const updated = await withAdminLock(s.orgId, () =>
      db.$transaction(async (tx) => {
      if (removesAdminRole) {
        const otherActiveAdmins = await tx.user.count({
          where: { orgId: s.orgId, role: 'ADMIN', active: true, id: { not: target.id } },
        })
        if (otherActiveAdmins === 0) throw new OperationConflictError('last-admin')
      }
      const r = await tx.user.updateMany({
        where: { id, orgId: s.orgId },
        data,
      })
      if (removesAdminRole) {
        // POST-WRITE RECHECK: SQLite deferred transactions let a concurrent
        // demotion's pre-check pass before ours commits — the write then
        // serializes AFTER it. Counting again (inside the same tx, after our
        // write) sees the interleaved state; zero remaining admins ⇒ abort +
        // full rollback of BOTH this mutation and nothing else.
        const remaining = await tx.user.count({
          where: { orgId: s.orgId, role: 'ADMIN', active: true },
        })
        if (remaining === 0) throw new OperationConflictError('last-admin')
      }
      return r
      })
    )
    if (updated.count === 0) return bad('not-found', 404)
  } catch (e) {
    if (e instanceof OperationConflictError) return bad(e.message, 400)
    throw e
  }
  const row = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  })
  return ok(row)
}
