import { db } from '@/lib/db'
import { startOfMonthCairo, daysAgo, startOfToday } from '@/lib/server-time'
import { round2 } from '@/lib/api-helpers'

export interface SalesAgg {
  revenue: number // net of tax
  grossTotal: number
  profit: number
  count: number
}

export async function aggregateSales(orgId: string, from: Date, to?: Date, type: 'SALE' | 'PURCHASE' = 'SALE'): Promise<SalesAgg> {
  const where: Record<string, unknown> = {
    orgId,
    type,
    status: { not: 'CANCELLED' },
    date: to ? { gte: from, lte: to } : { gte: from },
  }
  const rows = await db.invoice.findMany({
    where,
    select: { total: true, taxAmount: true, discount: true, costTotal: true },
  })
  let revenue = 0
  let gross = 0
  let cost = 0
  for (const r of rows) {
    const net = r.total - r.taxAmount
    revenue += net
    gross += r.total
    cost += r.costTotal
  }
  return {
    revenue: round2(revenue),
    grossTotal: round2(gross),
    profit: round2(revenue - cost),
    count: rows.length,
  }
}

export async function aggregateExpenses(orgId: string, from: Date): Promise<number> {
  const agg = await db.expense.aggregate({
    where: { orgId, date: { gte: from } },
    _sum: { amount: true },
  })
  return round2(agg._sum.amount ?? 0)
}

/** Net cash in hand: receipts − payments − expenses (all-time, cancelled invoices' vouchers still count). */
export async function cashInHand(orgId: string): Promise<{ receipts: number; payments: number; expenses: number; net: number }> {
  const [rec, pay, exp] = await Promise.all([
    db.voucher.aggregate({ where: { orgId, type: 'RECEIPT' }, _sum: { amount: true } }),
    db.voucher.aggregate({ where: { orgId, type: 'PAYMENT' }, _sum: { amount: true } }),
    db.expense.aggregate({ where: { orgId }, _sum: { amount: true } }),
  ])
  const receipts = round2(rec._sum.amount ?? 0)
  const payments = round2(pay._sum.amount ?? 0)
  const expenses = round2(exp._sum.amount ?? 0)
  return { receipts, payments, expenses, net: round2(receipts - payments - expenses) }
}

/**
 * Parties owed amounts (receivables / payables).
 *
 * Business rule (documented in DELETE /api/invoices/[id]): vouchers linked to a
 * CANCELLED invoice remain valid money movements — they are counted here as
 * party CREDIT (advance/overpaid), exactly like standalone vouchers. This keeps
 * balances consistent with the cash report (which always counts vouchers).
 * Balance aggregation is FULL-TABLE (not last-N) for every party.
 */
export async function partyDues(orgId: string) {
  const [purDues, customers, suppliers, standaloneReceipts, standalonePayments] = await Promise.all([
    db.invoice.findMany({
      where: { orgId, type: 'PURCHASE', status: { not: 'CANCELLED' }, supplierId: { not: null } },
      select: { supplierId: true, total: true, paidAmount: true },
    }),
    db.customer.findMany({ where: { orgId }, select: { id: true, name: true, phone: true, openingBalance: true } }),
    db.supplier.findMany({ where: { orgId }, select: { id: true, name: true, phone: true, openingBalance: true } }),
    // Standalone receipts + receipts on CANCELLED invoices → customer credit.
    db.voucher.groupBy({
      by: ['customerId'],
      where: {
        orgId,
        type: 'RECEIPT',
        customerId: { not: null },
        OR: [{ invoiceId: null }, { invoice: { status: 'CANCELLED' } }],
      },
      _sum: { amount: true },
    }),
    // Standalone payments + payments on CANCELLED invoices → supplier credit.
    db.voucher.groupBy({
      by: ['supplierId'],
      where: {
        orgId,
        type: 'PAYMENT',
        supplierId: { not: null },
        OR: [{ invoiceId: null }, { invoice: { status: 'CANCELLED' } }],
      },
      _sum: { amount: true },
    }),
  ])

  const sales = await db.invoice.findMany({
    where: { orgId, type: 'SALE', status: { not: 'CANCELLED' }, customerId: { not: null } },
    select: { customerId: true, total: true, paidAmount: true },
  })

  const sumBy = <T>(rows: T[], keyFn: (r: T) => string | null | undefined, valFn: (r: T) => number) => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const k = keyFn(r)
      if (!k) continue
      m.set(k, (m.get(k) ?? 0) + valFn(r))
    }
    return m
  }

  const saleDueMap = sumBy(sales, (i) => i.customerId, (i) => Math.max(0, i.total - i.paidAmount))
  const purDueMap = sumBy(purDues, (i) => i.supplierId, (i) => Math.max(0, i.total - i.paidAmount))
  const recMap = new Map((standaloneReceipts as Array<{ customerId: string | null; _sum: { amount: number | null } }>).map((r) => [r.customerId!, r._sum.amount ?? 0]))
  const payMap = new Map((standalonePayments as Array<{ supplierId: string | null; _sum: { amount: number | null } }>).map((r) => [r.supplierId!, r._sum.amount ?? 0]))

  const customerRows = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    owed: round2(c.openingBalance + (saleDueMap.get(c.id) ?? 0) - (recMap.get(c.id) ?? 0)),
  }))
  const supplierRows = suppliers.map((sup) => ({
    id: sup.id,
    name: sup.name,
    phone: sup.phone,
    owed: round2(sup.openingBalance + (purDueMap.get(sup.id) ?? 0) - (payMap.get(sup.id) ?? 0)),
  }))

  return {
    receivables: round2(customerRows.reduce((s, c) => s + Math.max(0, c.owed), 0)),
    payables: round2(supplierRows.reduce((s, sup) => s + Math.max(0, sup.owed), 0)),
    customerRows,
    supplierRows,
  }
}

/** Low stock products across all warehouses */
export async function lowStockProducts(orgId: string) {
  const products = await db.product.findMany({
    where: { orgId, active: true, trackStock: true, minQty: { gt: 0 } },
    include: {
      levels: { include: { warehouse: { select: { name: true } } } },
    },
  })
  const lows = products
    .map((p) => ({
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      minQty: p.minQty,
      qty: p.levels.reduce((s, l) => s + l.qty, 0),
      warehouseNames: p.levels.filter((l) => l.qty > 0).map((l) => `${l.warehouse.name} (${l.qty})`).join('، ') || '-',
    }))
    .filter((p) => p.qty <= p.minQty)
    .sort((a, b) => a.qty / Math.max(1e-9, a.minQty) - b.qty / Math.max(1e-9, b.minQty))
  return lows
}

export async function stockValuation(orgId: string): Promise<number> {
  const levels = await db.stockLevel.findMany({
    where: { warehouse: { orgId } },
    select: { qty: true, product: { select: { cost: true } } },
  })
  return round2(levels.reduce((s, l) => s + l.qty * l.product.cost, 0))
}

void startOfToday
