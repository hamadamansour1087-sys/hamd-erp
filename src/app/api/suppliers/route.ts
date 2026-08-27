import { getSession } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized } from '@/lib/api-helpers'
import { ok, bad, str, optStr, num } from '@/lib/api-helpers'

/** GET /api/suppliers?q= */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const q = str(req.nextUrl.searchParams.get('q'))
  const rows = await db.supplier.findMany({
    where: {
      orgId: s.orgId,
      ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  return ok(rows)
}

/** POST /api/suppliers { name, phone?, address?, openingBalance? } */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const name = str(body.name)
  if (!name) return bad('name-required')
  const row = await db.supplier.create({
    data: {
      orgId: s.orgId,
      name,
      phone: optStr(body.phone),
      address: optStr(body.address),
      openingBalance: num(body.openingBalance, 0),
      notes: optStr(body.notes),
    },
  })
  return ok(row)
}
