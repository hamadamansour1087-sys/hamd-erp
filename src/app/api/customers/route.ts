import { getSession, isStaff } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized, boundedStr, readJson } from '@/lib/api-helpers'
import { ok, bad, str, optStr, signedMoney, round2, forbidden } from '@/lib/api-helpers'

/** Hard result cap — well above SMB scale, but never unbounded. */
const LIST_TAKE = 2000

/** GET /api/customers?q= */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const q = boundedStr(req.nextUrl.searchParams.get('q'), 100)
  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where: {
        orgId: s.orgId,
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: LIST_TAKE,
    }),
    db.customer.count({ where: { orgId: s.orgId } }),
  ])
  // NON-SILENT TRUNCATION: when the hard cap clipped the result the client is
  // told via headers (body shape stays a plain array — no frontend breakage).
  // X-Truncated: 1 signals "filter or export instead of paging this list".
  const res = ok(rows)
  res.headers.set('X-Total-Count', String(total))
  if (rows.length >= LIST_TAKE && total > rows.length) res.headers.set('X-Truncated', '1')
  return res
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
