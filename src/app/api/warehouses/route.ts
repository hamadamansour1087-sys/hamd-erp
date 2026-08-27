import { getSession } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized } from '@/lib/api-helpers'
import { ok, bad, str, optStr } from '@/lib/api-helpers'

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

/** POST /api/warehouses { name, location?, phone? } */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const name = str(body.name)
  if (!name) return bad('name-required')
  const row = await db.warehouse.create({
    data: { orgId: s.orgId, name, location: optStr(body.location), phone: optStr(body.phone) },
  })
  return ok(row)
}
