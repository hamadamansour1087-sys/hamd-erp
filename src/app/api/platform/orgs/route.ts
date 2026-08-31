import { getSession, isSuperAdmin } from '@/lib/auth'
import { ok, unauthorized, forbidden, rateLimit, tooMany } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { normalizeStatus } from '@/lib/tenant'

/**
 * GET /api/platform/orgs — SUPERADMIN-only console feed: every tenant with
 * lifecycle state, owner contact, usage counters and rollup stats.
 *
 * Authorization is platform-level: a tenant ADMIN/MANAGER/CASHIER gets 403 —
 * cross-tenant data must never leak into the tenant app.
 */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isSuperAdmin(s)) return forbidden()
  if (!rateLimit(`platform:${s.orgId}`, 60, 60_000)) return tooMany()

  const orgs = await db.org.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      phone: true,
      status: true,
      trialEndsAt: true,
      approvedAt: true,
      adminNote: true,
      createdAt: true,
      _count: { select: { users: true, products: true, invoices: true } },
      users: {
        where: { role: 'ADMIN' },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { name: true, email: true },
      },
    },
  })

  const rows = orgs.map((o) => ({
    id: o.id,
    name: o.name,
    phone: o.phone,
    status: normalizeStatus(o.status),
    trialEndsAt: o.trialEndsAt,
    approvedAt: o.approvedAt,
    adminNote: o.adminNote,
    createdAt: o.createdAt,
    ownerName: o.users[0]?.name ?? null,
    ownerEmail: o.users[0]?.email ?? null,
    usersCount: o._count.users,
    productsCount: o._count.products,
    invoicesCount: o._count.invoices,
    isPlatformOrg: o.id === s.orgId,
  }))

  const stats = {
    total: rows.length,
    pending: rows.filter((r) => r.status === 'PENDING').length,
    trial: rows.filter((r) => r.status === 'TRIAL').length,
    active: rows.filter((r) => r.status === 'ACTIVE').length,
    suspended: rows.filter((r) => r.status === 'SUSPENDED').length,
  }

  return ok({ stats, orgs: rows })
}
