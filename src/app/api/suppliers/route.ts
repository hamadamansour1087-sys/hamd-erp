import { getSession, isStaff } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized, boundedStr, readJson } from '@/lib/api-helpers'
import { ok, bad, str, optStr, signedMoney, round2, forbidden } from '@/lib/api-helpers'

/** Hard result cap — well above SMB scale, but never unbounded. */
const LIST_TAKE = 2000

/** GET /api/suppliers?q= */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const q = boundedStr(req.nextUrl.searchParams.get('q'), 100)
  const [rows, total] = await Promise.all([
    db.supplier.findMany({
      where: {
        orgId: s.orgId,
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: LIST_TAKE,
    }),
    db.supplier.count({ where: { orgId: s.orgId } }),
  ])
  // NON-SILENT TRUNCATION (same contract as GET /api/customers): headers tell
  // the client the list was clipped without changing the JSON body shape.
  const res = ok(rows)
  res.headers.set('X-Total-Count', String(total))
  if (rows.length >= LIST_TAKE && total > rows.length) res.headers.set('X-Truncated', '1')
  return res
}

/**
 * POST /api/suppliers { name, phone?, address?, openingBalance? }
 *
 * AUTHORIZATION (server-side): openingBalance is a financial field. A CASHIER may
 * create suppliers but must NEVER set a non-zero opening balance — only
 * ADMIN/MANAGER can. Zero/absent openingBalance is allowed for cashiers.
 */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const body = await readJson(req)
  const name = boundedStr(body.name, 200)
  if (!name) return bad('name-required')
  const openingBalance = round2(signedMoney(body.openingBalance, 0))
  if (openingBalance !== 0 && !isStaff(s)) return forbidden()
  const row = await db.supplier.create({
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
