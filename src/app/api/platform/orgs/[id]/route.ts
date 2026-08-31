import { getSession, isSuperAdmin } from '@/lib/auth'
import { ok, bad, unauthorized, forbidden, readJson } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { normalizeStatus, ORG_STATUSES, TRIAL_DAYS } from '@/lib/tenant'

const ACTION_WHITELIST = ['approve', 'activate', 'trial', 'suspend', 'extend', 'delete'] as const
type Action = (typeof ACTION_WHITELIST)[number]

function clampDays(raw: unknown): number {
  const n = typeof raw === 'number' ? Math.floor(raw) : NaN
  if (!Number.isFinite(n)) return TRIAL_DAYS
  return Math.min(365, Math.max(1, n))
}

/**
 * POST /api/platform/orgs/[id] — SUPERADMIN-only tenant lifecycle transition.
 * body: { action: approve|activate|trial|suspend|extend|delete, days? }
 *
 *  - approve  PENDING  → TRIAL   (window = now + days, default TRIAL_DAYS)
 *  - activate any      → ACTIVE  (paid; window cleared)
 *  - trial    any      → TRIAL   (fresh window = now + days)
 *  - suspend  any      → SUSPENDED
 *  - extend   TRIAL    → window = max(now, window) + days
 *  - delete   —        → cascade delete the whole tenant
 *
 * The platform org itself (the caller's own org) can never be suspended,
 * downgraded or deleted — that would lock the company out of its console.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isSuperAdmin(s)) return forbidden()

  const { id } = await ctx.params
  const body = await readJson(req, 8_000)
  const rawAction = typeof body.action === 'string' ? body.action : ''
  const action = (ACTION_WHITELIST as readonly string[]).includes(rawAction)
    ? (rawAction as Action)
    : null
  if (!action) return bad('invalid-action')

  const org = await db.org.findUnique({
    where: { id },
    select: { id: true, status: true, trialEndsAt: true },
  })
  if (!org) return bad('org-not-found', 404)

  const selfTargeted = org.id === s.orgId
  if (selfTargeted && (action === 'delete' || action === 'suspend' || action === 'trial')) {
    return bad('cannot-touch-platform-org', 400)
  }

  const now = new Date()
  const days = clampDays(body.days)
  const plusDays = (from: Date, d: number) => new Date(from.getTime() + d * 86_400_000)

  switch (action) {
    case 'approve': {
      // Approve a pending request: TRIAL window starting NOW.
      if (normalizeStatus(org.status) !== 'PENDING') return bad('not-pending', 409)
      await db.org.update({
        where: { id: org.id },
        data: { status: 'TRIAL', trialEndsAt: plusDays(now, days), approvedAt: now },
      })
      break
    }
    case 'activate': {
      await db.org.update({
        where: { id: org.id },
        data: { status: 'ACTIVE', trialEndsAt: null, approvedAt: now },
      })
      break
    }
    case 'trial': {
      await db.org.update({
        where: { id: org.id },
        data: { status: 'TRIAL', trialEndsAt: plusDays(now, days), approvedAt: now },
      })
      break
    }
    case 'suspend': {
      await db.org.update({ where: { id: org.id }, data: { status: 'SUSPENDED' } })
      break
    }
    case 'extend': {
      // Extend from max(now, current end): extending an already-expired trial
      // must not credit the expired gap back to the tenant.
      const current = org.trialEndsAt && org.trialEndsAt.getTime() > now.getTime() ? org.trialEndsAt : now
      await db.org.update({
        where: { id: org.id },
        data: { status: 'TRIAL', trialEndsAt: plusDays(current, days) },
      })
      break
    }
    case 'delete': {
      // Cascades to users/products/invoices/... (onDelete: Cascade on every
      // tenant-owned table). The caller confirms in the UI; this is final.
      await db.org.delete({ where: { id: org.id } })
      break
    }
  }

  const updated = await db.org.findUnique({
    where: { id: org.id },
    select: { id: true, status: true, trialEndsAt: true },
  })
  return ok(updated ?? { id: org.id, status: 'DELETED', trialEndsAt: null })
}

/** GET /api/platform/orgs/[id] — status whitelist helper for the console UI. */
export async function GET(req: NextRequest) {
  // Invariant: EVERY handler authenticates. This endpoint returns only the
  // static status enum, but leaving it open would let a future edit leak
  // fields silently — gate it like everything else.
  const s = await getSession(req)
  if (!s) return unauthorized()
  return ok({ statuses: ORG_STATUSES })
}
