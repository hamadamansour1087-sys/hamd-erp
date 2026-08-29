import { getSession, isStaff } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized, boundedStr, readJson } from '@/lib/api-helpers'
import { ok, bad, str, optStr, forbidden } from '@/lib/api-helpers'

/** GET /api/units (read: all roles) */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const rows = await db.unit.findMany({ where: { orgId: s.orgId }, orderBy: { name: 'asc' } })
  return ok(rows)
}

/**
 * POST /api/units { name, shortName? }
 *
 * AUTHORIZATION (documented policy): unit management shapes the whole
 * catalog — writes are ADMIN/MANAGER only (CASHIER → 403), matching
 * PUT/DELETE on /api/units/[id]. Read stays open to all roles.
 */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const body = await readJson(req)
  const name = boundedStr(body.name, 200)
  if (!name) return bad('name-required')
  const row = await db.unit.create({
    data: {
      orgId: s.orgId,
      name,
      shortName: boundedStr(optStr(body.shortName) ?? name.slice(0, 4), 50),
    },
  })
  return ok(row)
}
