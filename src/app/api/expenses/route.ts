import { getSession } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized } from '@/lib/api-helpers'
import { ok, bad, str, optStr, num } from '@/lib/api-helpers'

/** GET /api/expenses?from=&to=&q=&page= */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const q = str(sp.get('q'))
  const page = Math.max(1, Math.floor(num(sp.get('page'), 1)))
  const pageSize = Math.min(200, Math.max(5, Math.floor(num(sp.get('pageSize'), 25))))

  const where: Record<string, unknown> = { orgId: s.orgId }
  const range: Record<string, Date> = {}
  if (from && !isNaN(new Date(from).getTime())) range.gte = new Date(from)
  if (to && !isNaN(new Date(to).getTime())) range.lte = new Date(new Date(to).getTime() + 86_399_000)
  if (Object.keys(range).length) where.date = range
  if (q) {
    where.OR = [{ category: { contains: q } }, { note: { contains: q } }]
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

/** POST /api/expenses { category, amount, method?, note?, date? } */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const amount = num(body.amount, 0)
  if (!(amount > 0)) return bad('amount-required')
  const method = ['CASH', 'BANK', 'CARD', 'WALLET'].includes(str(body.method)) ? str(body.method) : 'CASH'
  const row = await db.expense.create({
    data: {
      orgId: s.orgId,
      category: optStr(body.category) ?? 'عام',
      amount,
      method,
      note: optStr(body.note),
      userId: s.id,
      date:
        typeof body.date === 'string' && !isNaN(new Date(body.date).getTime())
          ? new Date(body.date)
          : new Date(),
    },
  })
  return ok(row)
}
