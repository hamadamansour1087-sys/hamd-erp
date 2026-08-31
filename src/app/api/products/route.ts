import { getSession } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

import { unauthorized, boundedStr, qtyVal, isUniqueViolation, isFkViolation, readJson } from '@/lib/api-helpers'
import { ok, bad, str, optStr, num, money, round2 } from '@/lib/api-helpers'
import { TRIAL_MAX_PRODUCTS, trialExpired } from '@/lib/tenant'

/**
 * GET /api/products?q=&categoryId=&active=&page=&pageSize=
 */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const sp = req.nextUrl.searchParams
  // SEARCH INPUT CAP: q feeds LIKE '%q%' patterns across 4 columns — an
  // unbounded pattern would let a crafted 100KB query burn query-planning
  // time per keystroke. 100 chars is far beyond any real product query.
  const q = boundedStr(sp.get('q'), 100)
  const categoryId = str(sp.get('categoryId'))
  const activeParam = sp.get('active')
  const page = Math.max(1, Math.floor(num(sp.get('page'), 1)))
  const pageSize = Math.min(200, Math.max(5, Math.floor(num(sp.get('pageSize'), 60))))

  const where: Record<string, unknown> = { orgId: s.orgId }
  if (q) {
    // FAST PATH: barcode/sku scanners send the FULL code — serve the indexed
    // exact lookup first instead of a 4-column LIKE scan on every POS scan.
    const exact = await db.product.findFirst({
      where: { orgId: s.orgId, OR: [{ barcode: q }, { sku: q }] },
      include: {
        levels: { select: { warehouseId: true, qty: true } },
        category: { select: { name: true } },
        unit: { select: { name: true, shortName: true } },
      },
    })
    if (exact) {
      return ok({
        total: 1,
        page: 1,
        pageSize,
        rows: [
          {
            ...exact,
            categoryName: exact.category?.name ?? null,
            unitName: exact.unit?.name ?? null,
            unitShort: exact.unit?.shortName ?? null,
            stock: exact.levels.reduce((sum, l) => sum + Number(l.qty), 0),
          },
        ],
      })
    }
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { nameEn: { contains: q, mode: 'insensitive' } },
      { barcode: { contains: q } },
      { sku: { contains: q } },
    ]
  }
  if (categoryId) where.categoryId = categoryId
  if (activeParam === '0' || activeParam === 'false') where.active = false
  else if (activeParam === '1' || activeParam === 'true') where.active = true

  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      include: {
        levels: { select: { warehouseId: true, qty: true } },
        category: { select: { name: true } },
        unit: { select: { name: true, shortName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return ok({
    total,
    page,
    pageSize,
    rows: rows.map((p) => ({
      ...p,
      categoryName: p.category?.name ?? null,
      unitName: p.unit?.name ?? null,
      unitShort: p.unit?.shortName ?? null,
      stock: p.levels.reduce((sum, l) => sum + Number(l.qty), 0),
    })),
  })
}

/**
 * POST /api/products — create; supports initial opening qty per warehouse
 * body: { name, nameEn?, sku?, barcode?, categoryId?, unitId?, cost, price,
 *         minQty?, trackStock?, imageUrl?, notes?, openingQty?: [{warehouseId, qty}] }
 */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (s.role === 'CASHIER') return bad('forbidden', 403)
  const body = await readJson(req)
  const name = boundedStr(body.name, 200)
  if (!name) return bad('name-required')

  // TRIAL CAP ("القيود" during the free period): a TRIAL org cannot grow its
  // catalog past the cap. Checked here (write path) — the session gate only
  // blocks pending/suspended/expired orgs, a live trial is allowed but capped.
  const orgRow = await db.org.findUnique({
    where: { id: s.orgId },
    select: { status: true, trialEndsAt: true },
  })
  if (orgRow?.status === 'TRIAL' && !trialExpired(orgRow.trialEndsAt)) {
    const count = await db.product.count({ where: { orgId: s.orgId } })
    if (count >= TRIAL_MAX_PRODUCTS) return bad('trial-limit-products', 403)
  }


  // TENANT-SAFETY: category/unit references must belong to the caller's org
  // (the FK alone would accept another tenant's id — existence ≠ ownership).
  const categoryId = optStr(body.categoryId)
  if (categoryId) {
    const cat = await db.category.findFirst({ where: { id: categoryId, orgId: s.orgId }, select: { id: true } })
    if (!cat) return bad('category-not-found')
  }
  const unitId = optStr(body.unitId)
  if (unitId) {
    const unit = await db.unit.findFirst({ where: { id: unitId, orgId: s.orgId }, select: { id: true } })
    if (!unit) return bad('unit-not-found')
  }

  // Bound the per-create work: each opening entry is 3 queries inside one write
  // tx — unbounded arrays would hold the SQLite write lock for seconds.
  const openings: Array<{ warehouseId: string; qty: unknown }> = Array.isArray(body.openingQty)
    ? body.openingQty.filter((o: { warehouseId?: unknown }) => typeof o?.warehouseId === 'string')
    : []
  if (openings.length > 50) return bad('too-many-openings')
  // NO SILENT SKIPS: an opening entry pointing at an unknown/foreign warehouse
  // or carrying a non-positive qty used to be dropped with `continue` — the
  // operator believed opening stock was recorded while the ledger said
  // otherwise. Validate everything up-front and fail loudly instead.
  for (const o of openings) {
    const wh = await db.warehouse.findFirst({ where: { id: o.warehouseId, orgId: s.orgId }, select: { id: true } })
    if (!wh) return bad('opening-warehouse-not-found')
    if (!(qtyVal(o.qty, 0) > 0)) return bad('invalid-opening-qty')
  }

  const created = await db.$transaction(async (tx) => {
    try {
      const product = await tx.product.create({
        data: {
          orgId: s.orgId,
          name,
          nameEn: boundedStr(optStr(body.nameEn), 200) || null,
          sku: boundedStr(optStr(body.sku), 100) || null,
          barcode: boundedStr(optStr(body.barcode), 100) || null,
          categoryId,
          unitId,
          // Money fields: finite, non-negative, rounded to 2dp (see docs/MONEY-AUDIT.md)
          cost: round2(money(body.cost, 0)),
          price: round2(money(body.price, 0)),
          minQty: round2(money(body.minQty, 0)),
          trackStock: body.trackStock !== false,
          imageUrl: boundedStr(optStr(body.imageUrl), 2048) || null,
          notes: boundedStr(optStr(body.notes), 2000) || null,
          active: body.active !== false,
        },
      })
      for (const o of openings) {
        // (pre-validated above: in-org warehouse, positive qty — no skips)
        const qty = qtyVal(o.qty, 0)
        await tx.stockLevel.upsert({
          where: { productId_warehouseId: { productId: product.id, warehouseId: o.warehouseId } },
          create: { productId: product.id, warehouseId: o.warehouseId, qty },
          update: { qty: { increment: qty } },
        })
        await tx.stockMovement.create({
          data: {
            orgId: s.orgId,
            productId: product.id,
            warehouseId: o.warehouseId,
            qty,
            kind: 'OPENING',
            refType: 'OPENING',
            refId: product.id,
            note: 'رصيد افتتاحي للمنتج',
            userId: s.id,
          },
        })
      }
      return { ok: true as const, product }
    } catch (e) {
      // UNIQUE(orgId, barcode) — surface a friendly 400, not a 500.
      if (isUniqueViolation(e, 'barcode')) return { ok: false as const, error: 'duplicate-barcode' }
      if (isUniqueViolation(e)) return { ok: false as const, error: 'duplicate-sku-or-barcode' }
      // R3-2: the up-front warehouse/category/unit validation runs OUTSIDE the
      // transaction — a concurrent delete landing in between makes the in-tx
      // insert FK-fail (P2003). Answer 409 instead of an opaque 500; the tx
      // has already rolled back so nothing is half-written.
      if (isFkViolation(e)) return { ok: false as const, error: 'reference-vanished' }
      throw e
    }
  })

  if (!created.ok) return bad(created.error, created.error === 'reference-vanished' ? 409 : 400)
  const withLevels = await db.product.findUnique({
    where: { id: created.product.id },
    include: { levels: { select: { warehouseId: true, qty: true } } },
  })
  return ok(withLevels)
}
