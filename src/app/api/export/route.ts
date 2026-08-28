import { getSession } from '@/lib/auth'
import { bad, unauthorized, forbidden, decToNum } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/**
 * GET /api/export — full JSON backup of the tenant (ADMIN only).
 */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (s.role !== 'ADMIN') return forbidden()

  try {
    const [org, users, categories, units, warehouses, products, levels, movements, customers, suppliers, invoices, items, vouchers, expenses, transfers] =
      await Promise.all([
        db.org.findUnique({ where: { id: s.orgId }, include: {} }),
        db.user.findMany({ where: { orgId: s.orgId }, select: { id: true, name: true, email: true, role: true, active: true, createdAt: true } }),
        db.category.findMany({ where: { orgId: s.orgId } }),
        db.unit.findMany({ where: { orgId: s.orgId } }),
        db.warehouse.findMany({ where: { orgId: s.orgId } }),
        db.product.findMany({ where: { orgId: s.orgId } }),
        db.stockLevel.findMany({ where: { warehouse: { orgId: s.orgId } } }),
        db.stockMovement.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: 'desc' }, take: 5000 }),
        db.customer.findMany({ where: { orgId: s.orgId } }),
        db.supplier.findMany({ where: { orgId: s.orgId } }),
        db.invoice.findMany({ where: { orgId: s.orgId }, orderBy: { date: 'desc' }, take: 5000 }),
        db.invoiceItem.findMany({ where: { invoice: { orgId: s.orgId } }, orderBy: {}, take: 20000 }),
        db.voucher.findMany({ where: { orgId: s.orgId }, orderBy: { date: 'desc' }, take: 5000 }),
        db.expense.findMany({ where: { orgId: s.orgId }, orderBy: { date: 'desc' }, take: 5000 }),
        db.transfer.findMany({ where: { orgId: s.orgId }, include: { items: true }, orderBy: { createdAt: 'desc' }, take: 3000 }),
      ])

    if (!org) return bad('not-found', 404)

    // TRUNCATION TRANSPARENCY: the backup caps huge tables so a runaway tenant
    // cannot OOM the server — but a "full backup" that silently drops rows is a
    // data-integrity lie. Every capped table is flagged in meta so the operator
    // knows this file is partial and must archive older data separately.
    const meta = {
      app: 'tijara',
      version: 2,
      exportedAt: new Date().toISOString(),
      truncated: {
        stockMovements: movements.length >= 5000,
        invoices: invoices.length >= 5000,
        invoiceItems: items.length >= 20000,
        vouchers: vouchers.length >= 5000,
        expenses: expenses.length >= 5000,
        transfers: transfers.length >= 3000,
      },
    }

    const backup = {
      meta,
      org,
      users,
      categories,
      units,
      warehouses,
      products,
      stockLevels: levels,
      stockMovements: movements,
      customers,
      suppliers,
      invoices,
      invoiceItems: items,
      vouchers,
      expenses,
      transfers,
    }

    const stamp = new Date().toISOString().slice(0, 10)
    // No JSON indent: a 20k-item backup pretty-printed roughly doubles the
    // memory spike and file size for zero machine-readability benefit.
    return new Response(JSON.stringify(decToNum(backup)), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="tijara-backup-${stamp}.json"`,
      },
    })
  } catch (e) {
    console.error('[export]', e)
    return bad('server-error', 500)
  }
}

void db
