import { getSession } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized, boundedStr } from '@/lib/api-helpers'
import { ok, bad, str, optStr } from '@/lib/api-helpers'

/** GET /api/units */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const rows = await db.unit.findMany({ where: { orgId: s.orgId }, orderBy: { name: 'asc' } })
  return ok(rows)
}

/** POST /api/units { name, shortName? } */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const name = boundedStr(body.name, 200)
  if (!name) return bad('name-required')
  const row = await db.unit.create({
    data: { orgId: s.orgId, name, shortName: optStr(body.shortName) ?? name.slice(0, 4) },
  })
  return ok(row)
}
