import { getSession, isStaff } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized, boundedStr, readJson } from '@/lib/api-helpers'
import { ok, bad, str, optStr, signedMoney, round2, forbidden } from '@/lib/api-helpers'

/** GET /api/customers?q= */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const q = boundedStr(req.nextUrl.searchParams.get('q'), 100)
  const rows = await db.customer.findMany({
    where: {
      orgId: s.orgId,
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  })
  return ok(rows)
}

/**
 * POST /api/customers { name, phone?, address?, openingBalance? }
 *
 * AUTHORIZATION (server-side): openingBalance is a financial field. A CASHIER may
 * create customers (POS flow) but must NEVER set a non-zero opening balance —
 * only ADMIN/MANAGER can. A zero/absent openingBalance is allowed for cashiers
 * so the quick-create flow keeps working.
 */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const body = await readJson(req)
  const name = boundedStr(body.name, 200)
  if (!name) return bad('name-required')
  const openingBalance = round2(signedMoney(body.openingBalance, 0))
  if (openingBalance !== 0 && !isStaff(s)) return forbidden()
  const row = await db.customer.create({
    data: {
      orgId: s.orgId,
      name,
      phone: boundedStr(optStr(body.phone), 100) || null,
      address: boundedStr(optStr(body.address), 1000) || null,
      // Signed balance: may be negative (credit). Finite + rounded (see docs/MONEY-AUDIT.md)
      openingBalance,
      notes: boundedStr(optStr(body.notes), 2000) || null,
    },
  })
  return ok(row)
}
