import { getSession, isStaff } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized, boundedStr } from '@/lib/api-helpers'
import { ok, bad, str, forbidden } from '@/lib/api-helpers'

/** GET /api/categories — list tenant categories (read: all roles) */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const rows = await db.category.findMany({
    where: { orgId: s.orgId },
    orderBy: [{ sort: 'asc' }, { name: 'asc' }],
  })
  return ok(rows)
}

/**
 * POST /api/categories { name, sort? }
 *
 * AUTHORIZATION (documented policy): category management shapes the whole
 * catalog — writes are ADMIN/MANAGER only (CASHIER → 403), matching
 * PUT/DELETE on /api/categories/[id]. Read stays open to all staff+cashier.
 */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const body = await req.json().catch(() => ({}))
  const name = boundedStr(body.name, 200)
  if (!name) return bad('name-required')
  const max = await db.category.aggregate({
    where: { orgId: s.orgId },
    _max: { sort: true },
  })
  const row = await db.category.create({
    data: {
      orgId: s.orgId,
      name,
      sort: typeof body.sort === 'number' ? body.sort : (max._max.sort ?? 0) + 1,
    },
  })
  return ok(row)
}
