import { getSession } from '@/lib/auth'
import {
  ok,
  bad,
  str,
  optStr,
  num,
  round2,
  unauthorized,
  forbidden,
  money,
  withIdempotency,
  okIdempotent,
} from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/**
 * GET /api/invoices?type=SALE|PURCHASE&status=&customerId=&supplierId=&warehouseId=
 *                    &q=&from=&to=&page=&pageSize=
 */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const sp = req.nextUrl.searchParams
  const type = sp.get('type') === 'PURCHASE' ? 'PURCHASE' : 'SALE'
  const status = sp.get('status') || undefined
  const customerId = sp.get('customerId') || undefined
  const supplierId = sp.get('supplierId') || undefined
  const warehouseId = sp.get('warehouseId') || undefined
  const q = str(sp.get('q'))
  const from = sp.get('from')
  const to = sp.get('to')
  const page = Math.max(1, Math.floor(num(sp.get('page'), 1)))
  const pageSize = Math.min(200, Math.max(5, Math.floor(num(sp.get('pageSize'), 25))))

  const where: Record<string, unknown> = { orgId: s.orgId, type }
  if (status) where.status = status
  if (customerId) where.customerId = customerId
  if (supplierId) where.supplierId = supplierId
  if (warehouseId) where.warehouseId = warehouseId
  const dateRange: Record<string, Date> = {}
  if (from) {
    const d = new Date(from)
    if (!isNaN(d.getTime())) dateRange.gte = d
  }
  if (to) {
    const d = new Date(to)
    if (!isNaN(d.getTime())) dateRange.lte = new Date(d.getTime() + 24 * 3600 * 1000 - 1)
  }
  if (Object.keys(dateRange).length > 0) where.date = dateRange
  if (/^\d+$/.test(q)) where.number = parseInt(q, 10)
  else if (q) {
    where.OR =
      type === 'SALE'
        ? [{ customer: { name: { contains: q } } }, { customer: { phone: { contains: q } } }]
        : [{ supplier: { name: { contains: q } } }, { supplier: { phone: { contains: q } } }]
  }

  const [total, rows] = await Promise.all([
    db.invoice.count({ where }),
    db.invoice.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
        warehouse: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
  ])

  return ok({
    total,
    page,
    pageSize,
    rows: rows.map((i) => ({
      id: i.id,
      number: i.number,
      type: i.type,
      status: i.status,
      date: i.date.toISOString(),
      partyName: i.customer?.name ?? i.supplier?.name ?? null,
      warehouseName: i.warehouse?.name ?? null,
      total: i.total,
      paidAmount: i.paidAmount,
      itemCount: i._count.items,
    })),
  })
}

/**
 * POST /api/invoices — create SALE or PURCHASE.
 * body: {
 *   type: 'SALE'|'PURCHASE',
 *   customerId?|supplierId?, warehouseId, items:[{productId, qty, price?, discount?}],
 *   discount?=0, taxPercent?=org default, notes?, dueDate?,
 *   paidAmount?=0, paidMethod?='CASH', date?
 * }
 * Effects inside one transaction:
 *  - sequential number per org+type (Counter INV/PUR)
 *  - item snapshots + costAtSale for profit tracking
 *  - StockLevel update + ledger movements per item (allows negative w/ warning)
 *  - auto payment voucher (RCV/PMT) when paidAmount>0 and a party exists or OTHER allowed
 */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()

  const body = await req.json().catch(() => ({}))
  const type = body.type === 'PURCHASE' ? 'PURCHASE' : 'SALE'
  // Authorization (server-side): CASHIER may create SALES (POS) but never PURCHASES.
  if (s.role === 'CASHIER' && type === 'PURCHASE') return forbidden()

  const itemsInput: Array<{ productId?: unknown; qty?: unknown; price?: unknown }> = Array.isArray(body.items)
    ? body.items.slice(0, 500)
    : []
  if (itemsInput.length === 0) return bad('items-required')

  // resolve warehouses / parties upfront (outside tx) for speed
  let warehouse: { id: string; name: string } | null = null
  if (optStr(body.warehouseId)) {
    warehouse = await db.warehouse.findFirst({
      where: { id: str(body.warehouseId), orgId: s.orgId },
      select: { id: true, name: true },
    })
  }
  if (!warehouse) {
    warehouse = await db.warehouse.findFirst({
      where: { orgId: s.orgId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true },
    })
  }
  if (!warehouse) return bad('warehouse-required')

  const customerId = optStr(body.customerId)
  const supplierId = optStr(body.supplierId)
  if (type === 'SALE' && customerId) {
    const c = await db.customer.findFirst({ where: { id: customerId, orgId: s.orgId }, select: { id: true } })
    if (!c) return bad('customer-not-found')
  }
  if (type === 'PURCHASE' && supplierId) {
    const sup = await db.supplier.findFirst({ where: { id: supplierId, orgId: s.orgId }, select: { id: true } })
    if (!sup) return bad('supplier-not-found')
  }

  const productIds = itemsInput.map((it) => str(it.productId)).filter(Boolean)
  const products = await db.product.findMany({
    where: { orgId: s.orgId, id: { in: productIds } },
    include: { unit: { select: { name: true, shortName: true } } },
  })
  const pmap = new Map(products.map((p) => [p.id, p]))

  // build normalized items
  const normItems: Array<{
    productId: string; qty: number; price: number; costAtSale: number
    nameSnap: string; unitSnap: string | null; barcodeSnap: string | null
    warnNegative: boolean; currentQty: number
  }> = []
  const warnings: string[] = []

  for (const it of itemsInput) {
    const productId = str(it.productId)
    const product = pmap.get(productId)
    if (!product) continue
    const qty = num(it.qty, 0)
    if (qty <= 0) continue
    const defaultPrice = type === 'SALE' ? product.price : product.cost
    const price = it.price !== undefined && it.price !== null && num(it.price, 0) >= 0 ? num(it.price, 0) : defaultPrice
    const level = await db.stockLevel.findUnique({
      where: { productId_warehouseId: { productId, warehouseId: warehouse.id } },
      select: { qty: true },
    })
    const currentQty = level?.qty ?? 0
    const effectiveQty = product.trackStock ? currentQty : Infinity
    let warnNegative = false
    if (product.trackStock) {
      if (type === 'SALE' && currentQty < qty) {
        warnNegative = true
        warnings.push(`${product.name}: ${currentQty} → ${round2(currentQty - qty)}`)
      }
    }
    void effectiveQty
    normItems.push({
      productId,
      qty: round2(qty),
      price: round2(price),
      costAtSale: type === 'SALE' ? product.cost : round2(price),
      nameSnap: product.name,
      unitSnap: product.unit?.shortName ?? product.unit?.name ?? null,
      barcodeSnap: product.barcode,
      warnNegative,
      currentQty,
    })
  }
  if (normItems.length === 0) return bad('items-invalid')

  const subtotal = round2(normItems.reduce((sum, it) => sum + it.qty * it.price, 0))
  let discount = money(body.discount, 0)
  discount = Math.min(discount, subtotal)
  // Tax percent must stay in a sane range — never negative, never above 100.
  const taxPercent = body.taxPercent !== undefined ? Math.min(100, Math.max(0, num(body.taxPercent, 0))) : undefined
  const taxPercentFinal = taxPercent !== undefined ? taxPercent : (await db.org.findUnique({ where: { id: s.orgId }, select: { taxPercent: true } }))?.taxPercent ?? 14
  const taxAmount = round2(((subtotal - discount) * taxPercentFinal) / 100)
  const total = round2(subtotal - discount + taxAmount)
  const costTotal = round2(normItems.reduce((sum, it) => sum + it.qty * it.costAtSale, 0))

  let paidAmount = money(body.paidAmount, 0)
  paidAmount = Math.min(paidAmount, total)
  const paidMethod = ['CASH', 'BANK', 'CARD', 'WALLET'].includes(str(body.paidMethod)) ? str(body.paidMethod) : 'CASH'
  const status = paidAmount <= 0 ? 'UNPAID' : paidAmount >= total ? 'PAID' : 'PARTIAL'
  const notes = optStr(body.notes)
  const invoiceDate = typeof body.date === 'string' && !isNaN(new Date(body.date).getTime()) ? new Date(body.date) : new Date()
  const dueDate = optStr(body.dueDate)

  const result = await withIdempotency(req, s, 'invoice', async () => {
    const created = await db.$transaction(async (tx) => {
    const number = await nextDocNumber(tx, s.orgId, type === 'SALE' ? 'INV' : 'PUR')
    const invoice = await tx.invoice.create({
      data: {
        orgId: s.orgId,
        number,
        type,
        status,
        customerId: type === 'SALE' ? customerId : null,
        supplierId: type === 'PURCHASE' ? supplierId : null,
        warehouseId: warehouse!.id,
        userId: s.id,
        date: invoiceDate,
        dueDate: dueDate ? new Date(dueDate) : null,
        subtotal,
        discount,
        taxPercent: taxPercentFinal,
        taxAmount,
        total,
        paidAmount,
        costTotal,
        notes,
        items: {
          create: normItems.map((it) => ({
            productId: it.productId,
            nameSnap: it.nameSnap,
            unitSnap: it.unitSnap,
            barcodeSnap: it.barcodeSnap,
            qty: it.qty,
            price: it.price,
            costAtSale: it.costAtSale,
            total: round2(it.qty * it.price),
          })),
        },
      },
      include: { items: true },
    })

    // stock effects
    for (const it of normItems) {
      const delta = type === 'SALE' ? -it.qty : it.qty
      await tx.stockLevel.upsert({
        where: { productId_warehouseId: { productId: it.productId, warehouseId: warehouse!.id } },
        create: { productId: it.productId, warehouseId: warehouse!.id, qty: delta },
        update: { qty: { increment: delta } },
      })
      await tx.stockMovement.create({
        data: {
          orgId: s.orgId,
          productId: it.productId,
          warehouseId: warehouse!.id,
          qty: delta,
          kind: type,
          refType: 'INVOICE',
          refId: invoice.id,
          userId: s.id,
        },
      })
    }

    // latest purchase updates product cost
    if (type === 'PURCHASE') {
      for (const it of normItems) {
        await tx.product.update({ where: { id: it.productId }, data: { cost: it.price } })
      }
    }

    // auto payment voucher
    let voucherNumber: number | null = null
    if (paidAmount > 0) {
      voucherNumber = await nextDocNumber(tx, s.orgId, type === 'SALE' ? 'RCV' : 'PMT')
      const snapshotName =
        type === 'SALE'
          ? (await findCustomerName(tx, s.orgId, customerId)) ?? 'عميل نقدي'
          : (await findSupplierName(tx, s.orgId, supplierId)) ?? 'مورد'
      await tx.voucher.create({
        data: {
          orgId: s.orgId,
          number: voucherNumber,
          type: type === 'SALE' ? 'RECEIPT' : 'PAYMENT',
          method: paidMethod,
          amount: paidAmount,
          partyType: type === 'SALE' ? (customerId ? 'CUSTOMER' : 'OTHER') : (supplierId ? 'SUPPLIER' : 'OTHER'),
          partyName: snapshotName,
          customerId: type === 'SALE' ? customerId : null,
          supplierId: type === 'PURCHASE' ? supplierId : null,
          invoiceId: invoice.id,
          note: `${type === 'SALE' ? 'دفعة على الفاتورة' : 'سداد للفاتورة'} رقم ${number}`,
          userId: s.id,
          date: invoiceDate,
        },
      })
    }

    return { invoice, voucherNumber }
  })

    return {
      id: created.invoice.id,
      number: created.invoice.number,
      voucherNumber: created.voucherNumber,
    }
  })

  return okIdempotent(result, (v) => ({
    type,
    status,
    subtotal,
    discount,
    taxPercent: taxPercentFinal,
    taxAmount,
    total,
    paidAmount,
    warnings,
    queued: false,
    invoice: v,
  }))
}

async function nextDocNumber(tx: any, orgId: string, docKey: string): Promise<number> {
  const c = await tx.counter.upsert({
    where: { orgId_docKey: { orgId, docKey } },
    create: { orgId, docKey, next: 2 },
    update: { next: { increment: 1 } },
  })
  return c.next - 1 || 1
}

function findCustomerName(tx: any, orgId: string, id: string | null) {
  if (!id) return Promise.resolve(null)
  return tx.customer
    .findFirst({ where: { id, orgId }, select: { name: true } })
    .then((r: { name: string } | null) => r?.name ?? null)
}
function findSupplierName(tx: any, orgId: string, id: string | null) {
  if (!id) return Promise.resolve(null)
  return tx.supplier
    .findFirst({ where: { id, orgId }, select: { name: true } })
    .then((r: { name: string } | null) => r?.name ?? null)
}
