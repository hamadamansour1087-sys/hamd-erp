import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { startOfMonthCairo, daysAgo, startOfToday } from '@/lib/server-time'
import { round2 } from '@/lib/api-helpers'

export interface SalesAgg {
  revenue: number // net of tax
  grossTotal: number
  profit: number
  count: number
}

/**
 * Sales/purchases aggregation — computed IN THE DATABASE (one index scan, one
 * row back) instead of streaming every matching invoice into JS. The old
 * findMany-then-sum approach transferred the whole period's invoice rows on
 * every dashboard/charts hit.
 */
export async function aggregateSales(orgId: string, from: Date, to?: Date, type: 'SALE' | 'PURCHASE' = 'SALE'): Promise<SalesAgg> {
  const where: Record<string, unknown> = {
    orgId,
    type,
    status: { not: 'CANCELLED' },
    date: to ? { gte: from, lte: to } : { gte: from },
  }
  const agg = await db.invoice.aggregate({
    where,
    _sum: { total: true, taxAmount: true, costTotal: true },
    _count: { _all: true },
  })
  const gross = Number(agg._sum.total ?? 0)
  const revenue = gross - Number(agg._sum.taxAmount ?? 0)
  const cost = Number(agg._sum.costTotal ?? 0)
  return {
    revenue: round2(revenue),
    grossTotal: round2(gross),
    profit: round2(revenue - cost),
    count: agg._count._all,
  }
}

export async function aggregateExpenses(orgId: string, from: Date): Promise<number> {
  const agg = await db.expense.aggregate({
    where: { orgId, date: { gte: from } },
    _sum: { amount: true },
  })
  return round2(Number(agg._sum.amount ?? 0))
}

/** Net cash in hand: receipts − payments − expenses (all-time, cancelled invoices' vouchers still count). */
export async function cashInHand(orgId: string): Promise<{ receipts: number; payments: number; expenses: number; net: number }> {
  const [rec, pay, exp] = await Promise.all([
    db.voucher.aggregate({ where: { orgId, type: 'RECEIPT' }, _sum: { amount: true } }),
    db.voucher.aggregate({ where: { orgId, type: 'PAYMENT' }, _sum: { amount: true } }),
    db.expense.aggregate({ where: { orgId }, _sum: { amount: true } }),
  ])
  const receipts = round2(Number(rec._sum.amount ?? 0))
  const payments = round2(Number(pay._sum.amount ?? 0))
  const expenses = round2(Number(exp._sum.amount ?? 0))
  return { receipts, payments, expenses, net: round2(receipts - payments - expenses) }
}

/**
 * Parties owed amounts (receivables / payables).
 *
 * Business rule (documented in DELETE /api/invoices/[id]): vouchers linked to a
 * CANCELLED invoice remain valid money movements — they are counted here as
 * party CREDIT (advance/overpaid), exactly like standalone vouchers. This keeps
 * balances consistent with the cash report (which always counts vouchers).
 *
 * Per-invoice dues use SUM(GREATEST(total - paid, 0)) evaluated IN SQL: the
 * clamp is per invoice (never sum-then-clamp), and only ONE aggregated row per
 * party crosses the wire instead of every invoice of the org's history.
 */
export async function partyDues(orgId: string) {
  const [purDuesRows, saleDuesRows, customers, suppliers, standaloneReceipts, standalonePayments] = await Promise.all([
    db.$queryRaw<Array<{ supplierId: string; due: unknown }>>`
      SELECT "supplierId", SUM(GREATEST(total - "paidAmount", 0)) AS due
      FROM "Invoice"
      WHERE "orgId" = ${orgId} AND type = 'PURCHASE' AND status <> 'CANCELLED' AND "supplierId" IS NOT NULL
      GROUP BY "supplierId"`,
    db.$queryRaw<Array<{ customerId: string; due: unknown }>>`
      SELECT "customerId", SUM(GREATEST(total - "paidAmount", 0)) AS due
      FROM "Invoice"
      WHERE "orgId" = ${orgId} AND type = 'SALE' AND status <> 'CANCELLED' AND "customerId" IS NOT NULL
      GROUP BY "customerId"`,
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

  const recMap = new Map((standaloneReceipts as Array<{ customerId: string | null; _sum: { amount: unknown } }>).map((r) => [r.customerId!, Number(r._sum.amount ?? 0)]))
  const payMap = new Map((standalonePayments as Array<{ supplierId: string | null; _sum: { amount: unknown } }>).map((r) => [r.supplierId!, Number(r._sum.amount ?? 0)]))

  const customerRows = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    owed: round2(
      Number(c.openingBalance) +
        Number(saleDuesRows.find((r) => r.customerId === c.id)?.due ?? 0) -
        (recMap.get(c.id) ?? 0)
    ),
  }))
  const supplierRows = suppliers.map((sup) => ({
    id: sup.id,
    name: sup.name,
    phone: sup.phone,
    owed: round2(
      Number(sup.openingBalance) +
        Number(purDuesRows.find((r) => r.supplierId === sup.id)?.due ?? 0) -
        (payMap.get(sup.id) ?? 0)
    ),
  }))

  return {
    receivables: round2(customerRows.reduce((s, c) => s + Math.max(0, c.owed), 0)),
    payables: round2(supplierRows.reduce((s, sup) => s + Math.max(0, sup.owed), 0)),
    customerRows,
    supplierRows,
  }
}

/**
 * Balance for ONE party (customer/supplier) — mirrors partyDues() exactly:
 *  - dues: per-invoice max(0, total - paidAmount) over NON-CANCELLED invoices,
 *    computed in SQL (one aggregated row; per-invoice clamp preserved via
 *    GREATEST so an overpaid invoice cannot distort other invoices' dues)
 *  - vouchers on CANCELLED invoices count as party CREDIT, exactly like
 *    standalone vouchers (see DELETE /api/invoices/[id] business rule #3)
 *  - full-set computation over ALL documents — never last-N.
 *
 * Used by /api/customers/[id] and /api/suppliers/[id] so the Customer/Supplier
 * profile, Dashboard, Reports and Ledger all share one formula by construction.
 */
export async function singlePartyDues(
  orgId: string,
  kind: 'customer' | 'supplier',
  partyId: string
): Promise<{ openingBalance: number; invoiceDues: number; voucherCredit: number; owed: number }> {
  const party =
    kind === 'customer'
      ? await db.customer.findFirst({ where: { id: partyId, orgId }, select: { openingBalance: true } })
      : await db.supplier.findFirst({ where: { id: partyId, orgId }, select: { openingBalance: true } })
  if (!party) return { openingBalance: 0, invoiceDues: 0, voucherCredit: 0, owed: 0 }

  const docType = kind === 'customer' ? 'SALE' : 'PURCHASE'
  const partyFilter =
    kind === 'customer'
      ? Prisma.sql`"customerId" = ${partyId}`
      : Prisma.sql`"supplierId" = ${partyId}`
  const duesRows = await db.$queryRaw<Array<{ due: unknown }>>`
    SELECT COALESCE(SUM(GREATEST(total - "paidAmount", 0)), 0) AS due
    FROM "Invoice"
    WHERE "orgId" = ${orgId} AND type = ${docType} AND status <> 'CANCELLED' AND ${partyFilter}`
  const invoiceDues = round2(Number(duesRows[0]?.due ?? 0))

  const credit = await db.voucher.aggregate({
    where: {
      orgId,
      type: kind === 'customer' ? 'RECEIPT' : 'PAYMENT',
      ...(kind === 'customer' ? { customerId: partyId } : { supplierId: partyId }),
      OR: [{ invoiceId: null }, { invoice: { status: 'CANCELLED' } }],
    },
    _sum: { amount: true },
  })
  const voucherCredit = round2(Number(credit._sum.amount ?? 0))

  return {
    openingBalance: Number(party.openingBalance),
    invoiceDues,
    voucherCredit,
    owed: round2(Number(party.openingBalance) + invoiceDues - voucherCredit),
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
      minQty: Number(p.minQty),
      qty: p.levels.reduce((s, l) => s + Number(l.qty), 0),
      warehouseNames: p.levels.filter((l) => Number(l.qty) > 0).map((l) => `${l.warehouse.name} (${Number(l.qty)})`).join('، ') || '-',
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
  return round2(levels.reduce((s, l) => s + Number(l.qty) * Number(l.product.cost), 0))
}

void startOfToday
void daysAgo
void startOfMonthCairo
