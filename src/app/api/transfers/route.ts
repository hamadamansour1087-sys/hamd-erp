import { getSession, isStaff } from '@/lib/auth'
import {
  ok,
  bad,
  str,
  optStr,
  num,
  round2,
  unauthorized,
  forbidden,
  withIdempotency,
  okIdempotent,
} from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/**
 * GET /api/transfers — recent transfers with names.
 */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const page = Math.max(1, Math.floor(num(req.nextUrl.searchParams.get('page'), 1)))
  const pageSize = Math.min(100, Math.max(5, Math.floor(num(req.nextUrl.searchParams.get('pageSize'), 25))))
  const [total, rows] = await Promise.all([
    db.transfer.count({ where: { orgId: s.orgId } }),
    db.transfer.findMany({
      where: { orgId: s.orgId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        items: true,
        fromWarehouse: { select: { name: true } },
        toWarehouse: { select: { name: true } },
      },
    }),
  ])
  const creatorIds = Array.from(new Set(rows.map((t) => t.userId).filter((v): v is string => !!v)))
  const creators = creatorIds.length
    ? await db.user.findMany({ where: { orgId: s.orgId, id: { in: creatorIds } }, select: { id: true, name: true } })
    : []
  const umap = new Map(creators.map((u) => [u.id, u.name]))
  return ok({
    total,
    page,
    pageSize,
    rows: rows.map((t) => ({
      id: t.id,
      number: t.number,
      fromName: t.fromWarehouse.name,
      toName: t.toWarehouse.name,
      note: t.note,
      createdBy: (t.userId && umap.get(t.userId)) || null,
      date: t.createdAt.toISOString(),
      itemCount: t.items.length,
      items: t.items.map((i) => ({ productId: i.productId, productName: i.productName, qty: i.qty })),
    })),
  })
}

/**
 * POST /api/transfers — move stock between warehouses (staff only).
 * body { fromWarehouseId, toWarehouseId, items:[{productId, qty}], note? }
 */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  // Authorization (server-side): stock transfers are a management operation.
  if (!isStaff(s)) return forbidden()
  const body = await req.json().catch(() => ({}))
  const fromId = str(body.fromWarehouseId)
  const toId = str(body.toWarehouseId)
  if (!fromId || !toId || fromId === toId) return bad('warehouses-invalid')

  const [fromWh, toWh] = await Promise.all([
    db.warehouse.findFirst({ where: { id: fromId, orgId: s.orgId }, select: { id: true } }),
    db.warehouse.findFirst({ where: { id: toId, orgId: s.orgId }, select: { id: true } }),
  ])
  if (!fromWh || !toWh) return bad('warehouses-not-found')

  const rawItems: Array<{ productId?: unknown; qty?: unknown }> = Array.isArray(body.items) ? body.items : []
  if (rawItems.length === 0) return bad('items-required')

  const productIds = rawItems.map((i) => str(i.productId)).filter(Boolean)
  const products = await db.product.findMany({
    where: { orgId: s.orgId, id: { in: productIds }, trackStock: true },
    select: { id: true, name: true },
  })
  const pmap = new Map(products.map((p) => [p.id, p.name]))

  const items: Array<{ productId: string; qty: number }> = []
  for (const it of rawItems) {
    const pid = str(it.productId)
    const qty = round2(num(it.qty, 0))
    if (!pid || qty <= 0 || !pmap.has(pid)) continue
    items.push({ productId: pid, qty })
  }
  if (items.length === 0) return bad('items-invalid')

  const result = await withIdempotency(req, s, 'transfer', async () => {
    const created = await db.$transaction(async (tx) => {
    const c = await tx.counter.upsert({
      where: { orgId_docKey: { orgId: s.orgId, docKey: 'TRF' } },
      create: { orgId: s.orgId, docKey: 'TRF', next: 2 },
      update: { next: { increment: 1 } },
    })
    const number = c.next - 1 || 1

    const transfer = await tx.transfer.create({
      data: {
        orgId: s.orgId,
        number,
        fromWarehouseId: fromId,
        toWarehouseId: toId,
        note: optStr(body.note),
        userId: s.id,
        items: {
          create: items.map((i) => ({ productId: i.productId, productName: pmap.get(i.productId)!, qty: i.qty })),
        },
      },
      include: { items: true },
    })

    for (const it of items) {
      // decrement source
      const src = await tx.stockLevel.upsert({
        where: { productId_warehouseId: { productId: it.productId, warehouseId: fromId } },
        create: { productId: it.productId, warehouseId: fromId, qty: -it.qty },
        update: { qty: { decrement: it.qty } },
      })
      void src
      // increment target
      await tx.stockLevel.upsert({
        where: { productId_warehouseId: { productId: it.productId, warehouseId: toId } },
        create: { productId: it.productId, warehouseId: toId, qty: it.qty },
        update: { qty: { increment: it.qty } },
      })
      // ledger pair
      await tx.stockMovement.createMany({
        data: [
          {
            orgId: s.orgId,
            productId: it.productId,
            warehouseId: fromId,
            qty: -it.qty,
            kind: 'TRANSFER_OUT',
            refType: 'TRANSFER',
            refId: transfer.id,
            userId: s.id,
          },
          {
            orgId: s.orgId,
            productId: it.productId,
            warehouseId: toId,
            qty: it.qty,
            kind: 'TRANSFER_IN',
            refType: 'TRANSFER',
            refId: transfer.id,
            userId: s.id,
          },
        ],
      })
    }
    return transfer
  })

    return { id: created.id, number: created.number, itemCount: items.length }
  })

  return okIdempotent(result)
}
