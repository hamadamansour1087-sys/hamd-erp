import { getSession } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized } from '@/lib/api-helpers'
import { ok, num, round2 } from '@/lib/api-helpers'
import { lowStockProducts, stockValuation } from '@/lib/reports-utils'
import { startOfToday } from '@/lib/server-time'

/**
 * GET /api/reports/charts?days=30|90|365
 * Returns bucketed sales/purchases series, top products/categories,
 * stock valuation and low-stock list.
 */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const days = [7, 30, 90, 180, 365].includes(num(req.nextUrl.searchParams.get('days'), 30))
    ? num(req.nextUrl.searchParams.get('days'), 30)
    : 30

  const dayStart = startOfToday()
  const from = new Date(dayStart.getTime() - (days - 1) * 86_400_000)
  const to = new Date(dayStart.getTime() + 86_399_000)

  const locale = req.nextUrl.searchParams.get('lang') === 'en' ? 'en-GB' : 'ar-EG'
  const dateFmt = new Intl.DateTimeFormat(locale === 'ar-EG' ? 'ar-EG' : 'en-GB', {
    timeZone: 'Africa/Cairo',
    day: 'numeric',
    month: 'short',
  })

  // Bucket key = Y-M-D in Cairo so points land on the right local day.
  const keyFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  function keyOf(d: Date) {
    return keyFmt.format(d)
  }

  const emptyBuckets = () => {
    const m = new Map<string, { label: string; sales: number; profit: number; purchases: number; expenses: number; count: number; netRev: number }>()
    for (let i = 0; i < days; i++) {
      const d = new Date(from.getTime() + i * 86_400_000)
      m.set(keyOf(d), { label: dateFmt.format(d), sales: 0, profit: 0, purchases: 0, expenses: 0, count: 0, netRev: 0 })
    }
    return m
  }

  // run the heavy work in JS — dataset sizes are SMB-appropriate
  const [salesInv, purInv, expenses, valuation, lows] = await Promise.all([
    db.invoice.findMany({
      where: { orgId: s.orgId, type: 'SALE', status: { not: 'CANCELLED' }, date: { gte: from, lte: to } },
      select: { date: true, total: true, taxAmount: true, costTotal: true },
    }),
    db.invoice.findMany({
      where: { orgId: s.orgId, type: 'PURCHASE', status: { not: 'CANCELLED' }, date: { gte: from, lte: to } },
      select: { date: true, total: true },
    }),
    db.expense.findMany({
      where: { orgId: s.orgId, date: { gte: from, lte: to } },
      select: { date: true, amount: true },
    }),
    stockValuation(s.orgId),
    lowStockProducts(s.orgId),
  ])

  const buckets = emptyBuckets()
  // DST-SAFE bucket lookup: Africa/Cairo reinstated daylight saving (2023) —
  // with 23h/25h days, stepping `from` by 24h produces a DUPLICATE or MISSING
  // calendar-day key. A missing key used to silently DROP that day's sales
  // (`if (!b) continue`); now any unseen key is created on demand from the
  // row's own date, so every document lands in exactly one bucket.
  const bucketFor = (key: string, d: Date) => {
    let b = buckets.get(key)
    if (!b) {
      b = { label: dateFmt.format(d), sales: 0, profit: 0, purchases: 0, expenses: 0, count: 0, netRev: 0 }
      buckets.set(key, b)
    }
    return b
  }
  for (const inv of salesInv) {
    const d = new Date(inv.date)
    const b = bucketFor(keyOf(d), d)
    b.sales += Number(inv.total)
    b.netRev += Number(inv.total) - Number(inv.taxAmount)
    b.profit += Number(inv.total) - Number(inv.taxAmount) - Number(inv.costTotal)
    b.count++
  }
  for (const inv of purInv) {
    const d = new Date(inv.date)
    const b = bucketFor(keyOf(d), d)
    b.purchases += Number(inv.total)
  }
  for (const ex of expenses) {
    const d = new Date(ex.date)
    const b = bucketFor(keyOf(d), d)
    b.expenses += Number(ex.amount)
  }

  const sortedKeys = Array.from(buckets.keys()).sort()
  const salesSeries = sortedKeys.map((k) => {
    const b = buckets.get(k)!
    return { label: b.label, value: round2(b.sales), secondary: round2(Math.max(0, b.profit)), count: b.count }
  })
  const purchasesSeries = sortedKeys.map((k) => ({ label: buckets.get(k)!.label, value: round2(buckets.get(k)!.purchases) }))
  const expenseSeries = sortedKeys.map((k) => ({ label: buckets.get(k)!.label, value: round2(buckets.get(k)!.expenses) }))

  const [topItems, allCats] = await Promise.all([
    db.invoiceItem.groupBy({
      by: ['productId'],
      where: {
        invoice: { orgId: s.orgId, type: 'SALE', status: { not: 'CANCELLED' }, date: { gte: from, lte: to } },
      },
      _sum: { total: true, qty: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 8,
    }),
    db.category.findMany({ where: { orgId: s.orgId }, select: { id: true, name: true } }),
  ])

  // CATEGORY REVENUE — grouped IN THE DATABASE (one row per product) instead
  // of streaming every invoice item in the range into JS.
  const rangeAgg = await db.invoiceItem.groupBy({
    by: ['productId'],
    where: { invoice: { orgId: s.orgId, type: 'SALE', status: { not: 'CANCELLED' }, date: { gte: from, lte: to } } },
    _sum: { total: true },
  })
  // ONE product fetch covers BOTH the top-8 names and the category mapping.
  const prodIds = Array.from(new Set([...topItems.map((t) => t.productId), ...rangeAgg.map((t) => t.productId)]))
  const prods = await db.product.findMany({
    where: { orgId: s.orgId, id: { in: prodIds } },
    select: { id: true, name: true, categoryId: true },
  })
  const pmap = new Map(prods.map((p) => [p.id, p]))
  const catMap = new Map(allCats.map((c) => [c.id, c.name]))

  const topProducts = topItems.map((t) => ({
    label: pmap.get(t.productId)?.name ?? '-',
    value: round2(Number(t._sum.total ?? 0)),
    secondary: Number(t._sum.qty ?? 0),
  }))

  // category revenue within range (from the grouped rows)
  const catTotals = new Map<string, number>()
  catTotals.set('__none__', 0)
  for (const row of rangeAgg) {
    const p = pmap.get(row.productId)
    const catId = p?.categoryId ?? '__none__'
    catTotals.set(catId, (catTotals.get(catId) ?? 0) + Number(row._sum.total ?? 0))
  }
  const topCategories = Array.from(catTotals.entries())
    .map(([id, v]) => ({ label: id === '__none__' ? 'غير مصنف' : (catMap.get(id) ?? 'غير مصنف'), value: round2(v) }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  // top customers by revenue in range
  const custAgg = await db.invoice.groupBy({
    by: ['customerId'],
    where: { orgId: s.orgId, type: 'SALE', status: { not: 'CANCELLED' }, customerId: { not: null }, date: { gte: from, lte: to } },
    _sum: { total: true },
    orderBy: { _sum: { total: 'desc' } },
    take: 5,
  })
  const custIds = custAgg.map((c) => c.customerId).filter((x): x is string => x !== null)
  const custs = custIds.length > 0
    ? await db.customer.findMany({ where: { orgId: s.orgId, id: { in: custIds } }, select: { id: true, name: true } })
    : []
  const cmap = new Map(custs.map((c) => [c.id, c.name]))
  const topCustomers = custAgg.map((c) => ({
    label: (c.customerId && cmap.get(c.customerId)) || 'عميل نقدي',
    value: round2(Number(c._sum.total ?? 0)),
  }))

  void round2

  return ok({
    rangeDays: days,
    salesSeries,
    purchasesSeries,
    expenseSeries,
    topProducts,
    topCategories,
    topCustomers,
    valuation,
    lowStock: lows.slice(0, 12),
  })
}
