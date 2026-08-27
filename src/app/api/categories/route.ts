import { getSession } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized } from '@/lib/api-helpers'
import { ok, bad, str } from '@/lib/api-helpers'

/** GET /api/categories — list tenant categories */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const rows = await db.category.findMany({
    where: { orgId: s.orgId },
    orderBy: [{ sort: 'asc' }, { name: 'asc' }],
  })
  return ok(rows)
}

/** POST /api/categories { name, sort? } */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const name = str(body.name)
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
