import { getSession } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized } from '@/lib/api-helpers'
import { ok, round2 } from '@/lib/api-helpers'
import {
  aggregateSales,
  aggregateExpenses,
  cashInHand,
  partyDues,
  lowStockProducts,
} from '@/lib/reports-utils'
import { startOfToday, daysAgo, startOfMonthCairo } from '@/lib/server-time'

/** GET /api/reports/dashboard — headline KPIs for the Dashboard view. */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()

  const today = startOfToday()
  const monthStart = startOfMonthCairo(0)

  const [todaySales, weekSales, monthSales, monthPurchases, expensesMonth, cash, dues, lows, counts] =
    await Promise.all([
      aggregateSales(s.orgId, today),
      aggregateSales(s.orgId, daysAgo(7)),
      aggregateSales(s.orgId, monthStart),
      aggregateSales(s.orgId, monthStart, new Date(), 'PURCHASE'),
      aggregateExpenses(s.orgId, monthStart),
      cashInHand(s.orgId),
      partyDues(s.orgId),
      lowStockProducts(s.orgId),
      Promise.all([
        db.product.count({ where: { orgId: s.orgId, active: true } }),
        db.customer.count({ where: { orgId: s.orgId } }),
        db.supplier.count({ where: { orgId: s.orgId } }),
      ]),
    ])

  return ok({
    todaySales: todaySales.grossTotal,
    todayProfit: todaySales.profit,
    todayInvoices: todaySales.count,
    weekSales: weekSales.grossTotal,
    monthSales: monthSales.grossTotal,
    monthNetRevenue: monthSales.revenue,
    monthPurchases: monthPurchases.grossTotal,
    monthProfit: monthSales.profit,
    monthExpenses: expensesMonth,
    cashInHand: cash.net,
    receiptsTotal: cash.receipts,
    paymentsTotal: cash.payments,
    counts: { products: counts[0], customers: counts[1], suppliers: counts[2] },
    lowStockCount: lows.length,
    receivables: dues.receivables,
    payables: dues.payables,
  })
}

void round2
