import { getSession, isStaff } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized, boundedStr } from '@/lib/api-helpers'
import { ok, bad, str, optStr, forbidden } from '@/lib/api-helpers'

/** GET /api/warehouses — with product/level counts */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const rows = await db.warehouse.findMany({
    where: { orgId: s.orgId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { levels: true } } },
  })
  return ok(rows.map(({ _count, ...w }) => ({ ...w, levelCount: _count.levels })))
}

/**
 * POST /api/warehouses { name, location?, phone? }
 *
 * AUTHORIZATION (server-side): warehouses are inventory infrastructure —
 * creation is ADMIN/MANAGER only. CASHIER → 403.
 */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const body = await req.json().catch(() => ({}))
  const name = boundedStr(body.name, 200)
  if (!name) return bad('name-required')
  const row = await db.warehouse.create({
    data: { orgId: s.orgId, name, location: optStr(body.location), phone: optStr(body.phone) },
  })
  return ok(row)
}
