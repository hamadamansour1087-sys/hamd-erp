import { getSession } from '@/lib/auth'
import { bad, unauthorized, forbidden } from '@/lib/api-helpers'
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

    const backup = {
      meta: {
        app: 'tijara',
        version: 1,
        exportedAt: new Date().toISOString(),
      },
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
    return new Response(JSON.stringify(backup, null, 2), {
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
