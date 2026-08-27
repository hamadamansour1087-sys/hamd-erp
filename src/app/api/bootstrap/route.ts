import { getSession } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized } from '@/lib/api-helpers'
import { ok } from '@/lib/api-helpers'

/**
 * GET /api/bootstrap — everything the SPA needs right after login,
 * cached client-side for offline mode.
 */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()

  const [org, categories, units, warehouses, products, customers, suppliers] =
    await Promise.all([
      db.org.findUnique({
        where: { id: s.orgId },
        select: {
          id: true, name: true, currencyCode: true, taxPercent: true,
          phone: true, address: true, logo: true, invoiceTemplate: true,
        },
      }),
      db.category.findMany({ where: { orgId: s.orgId }, orderBy: [{ sort: 'asc' }, { name: 'asc' }] }),
      db.unit.findMany({ where: { orgId: s.orgId }, orderBy: { name: 'asc' } }),
      db.warehouse.findMany({ where: { orgId: s.orgId }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
      db.product.findMany({
        where: { orgId: s.orgId, active: true },
        include: {
          levels: { select: { warehouseId: true, qty: true } },
          category: { select: { name: true } },
          unit: { select: { name: true, shortName: true } },
        },
        orderBy: { name: 'asc' },
      }),
      db.customer.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: 'desc' }, take: 3000 }),
      db.supplier.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: 'desc' }, take: 1500 }),
    ])

  if (!org) return unauthorized()

  let template: unknown = null
  try {
    template = org.invoiceTemplate ? JSON.parse(org.invoiceTemplate) : null
  } catch {
    template = null
  }

  const productDTOs = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    nameEn: p.nameEn,
    categoryId: p.categoryId,
    categoryName: p.category?.name ?? null,
    unitId: p.unitId,
    unitName: p.unit?.name ?? null,
    unitShort: p.unit?.shortName ?? null,
    cost: p.cost,
    price: p.price,
    minQty: p.minQty,
    trackStock: p.trackStock,
    imageUrl: p.imageUrl,
    notes: p.notes,
    active: p.active,
    levels: p.levels,
    stock: p.levels.reduce((sum, l) => sum + l.qty, 0),
  }))

  void 0

  return ok({
    user: s,
    org: {
      id: org.id,
      name: org.name,
      currencyCode: org.currencyCode,
      taxPercent: org.taxPercent,
      phone: org.phone,
      address: org.address,
      logo: org.logo,
    },
    categories,
    units,
    warehouses,
    products: productDTOs,
    customers,
    suppliers,
    template,
  })
}
