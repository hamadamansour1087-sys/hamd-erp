import { getSession, isStaff } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized, boundedStr, readJson } from '@/lib/api-helpers'
import {
  ok,
  bad,
  str,
  optStr,
  num,
  forbidden,
  money,
  round2,
  safeDate,
  withIdempotency,
  okIdempotent,
  isUniqueViolation,
} from '@/lib/api-helpers'

/** GET /api/expenses?from=&to=&q=&page= */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const q = boundedStr(sp.get('q'), 100)
  const page = Math.max(1, Math.floor(num(sp.get('page'), 1)))
  const pageSize = Math.min(200, Math.max(5, Math.floor(num(sp.get('pageSize'), 25))))

  const where: Record<string, unknown> = { orgId: s.orgId }
  const range: Record<string, Date> = {}
  if (from && !isNaN(new Date(from).getTime())) range.gte = new Date(from)
  if (to && !isNaN(new Date(to).getTime())) range.lte = new Date(new Date(to).getTime() + 86_399_000)
  if (Object.keys(range).length) where.date = range
  if (q) {
    where.OR = [{ category: { contains: q, mode: 'insensitive' } }, { note: { contains: q, mode: 'insensitive' } }]
  }

  const [total, rows, categoriesRaw] = await Promise.all([
    db.expense.count({ where }),
    db.expense.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.expense.findMany({
      where: { orgId: s.orgId },
      distinct: ['category'],
      select: { category: true },
    }),
  ])

  return ok({
    total,
    page,
    pageSize,
    categories: categoriesRaw.map((c) => c.category).filter(Boolean).sort(),
    rows,
  })
}

/** POST /api/expenses { category, amount, method?, note?, date? } — staff only */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  // Authorization (server-side): expenses are a management operation.
  if (!isStaff(s)) return forbidden()
  const body = await readJson(req)
  const amount = round2(money(body.amount, 0))
  if (!(amount > 0)) return bad('amount-required')
  const method = ['CASH', 'BANK', 'CARD', 'WALLET'].includes(str(body.method)) ? str(body.method) : 'CASH'

  const result = await withIdempotency(req, s, 'expense', async (clientOpId) => {
    // CRASH-WINDOW DEDUPE: scoped key embedded in the document (@@unique per
    // org). A retry after a post-COMMIT crash resolves to the committed row.
    try {
      const row = await db.expense.create({
        data: {
          orgId: s.orgId,
          category: optStr(body.category)?.slice(0, 120) ?? 'عام',
          amount,
          method,
          note: optStr(body.note)?.slice(0, 500),
          userId: s.id,
          clientOperationId: clientOpId,
          // safeDate bounds [2000, 2100] — a year-9999 expense poisons period
          // reports; unparseable dates fall back to now (previous behavior).
          date: safeDate(body.date) ?? new Date(),
        },
      })
      return row
    } catch (e) {
      if (clientOpId && isUniqueViolation(e, 'clientOperationId')) {
        const dup = await db.expense.findFirst({ where: { orgId: s.orgId, clientOperationId: clientOpId } })
        if (dup) return dup
      }
      throw e
    }
  })
  return okIdempotent(result)
}
