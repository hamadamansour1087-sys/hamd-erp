import { getSession } from '@/lib/auth'
import {
  ok,
  bad,
  boundedStr,
  str,
  optStr,
  num,
  round2,
  unauthorized,
  forbidden,
  money,
  MAX_QTY,
  safeDate,
  readJson,
  withDbRetry,
  withIdempotency,
  okIdempotent,
  isUniqueViolation,
  InsufficientStockError,
} from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { TRIAL_MAX_INVOICES, trialExpired } from '@/lib/tenant'

/** Int4 ceiling for Prisma `number` filters — a bigger digit-run is garbage. */
const MAX_DOC_NUMBER = 2_147_483_647

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
  const q = boundedStr(sp.get('q'), 100)
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
  if (/^\d+$/.test(q)) {
    // Overflow guard: a 20-digit "number" would crash the Int4 filter (500).
    // Anything past the Int4 ceiling can never match — short-circuit honestly.
    const n = Number(q)
    if (!(Number.isSafeInteger(n) && n >= 1 && n <= MAX_DOC_NUMBER)) {
      return ok({ total: 0, page, pageSize, rows: [] })
    }
    where.number = n
  } else if (q) {
    where.OR =
      type === 'SALE'
        ? [
            { customer: { name: { contains: q, mode: 'insensitive' } } },
            { customer: { phone: { contains: q } } },
          ]
        : [
            { supplier: { name: { contains: q, mode: 'insensitive' } } },
            { supplier: { phone: { contains: q } } },
          ]
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
 *  - sequential number per org+type (Counter INV/PUR — allocated OUTSIDE the
 *    tx so the org's hot counter row is not locked for the whole transaction)
 *  - item snapshots + costAtSale for profit tracking
 *  - StockLevel update + ledger movements per item (allows negative w/ warning
 *    when org.allowNegativeStock=true — documented POS feature; when false the
 *    SALE decrement is an ATOMIC conditional update: stock < requested ⇒ 409)
 *  - auto payment voucher (RCV/PMT) when paidAmount>0 and a party exists or OTHER allowed
 */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()

  // Body-size cap: 500 items bounded — hostile payloads never get buffered.
  const body = await readJson(req, 2_000_000)
  const type = body.type === 'PURCHASE' ? 'PURCHASE' : 'SALE'
  // Authorization (server-side): CASHIER may create SALES (POS) but never PURCHASES.
  if (s.role === 'CASHIER' && type === 'PURCHASE') return forbidden()

  // TRIAL CAP ("القيود" during the free period): sales documents are capped
  // for a TRIAL org (purchases stay open — stocking up for a demo is fine).
  if (type === 'SALE') {
    const orgRow = await db.org.findUnique({
      where: { id: s.orgId },
      select: { status: true, trialEndsAt: true },
    })
    if (orgRow?.status === 'TRIAL' && !trialExpired(orgRow.trialEndsAt)) {
      const count = await db.invoice.count({ where: { orgId: s.orgId, type: 'SALE' } })
      if (count >= TRIAL_MAX_INVOICES) return bad('trial-limit-invoices', 403)
    }
  }


  if (!Array.isArray(body.items) || body.items.length === 0) return bad('items-required')
  // Hard cap on line count — silently SILENCING lines beyond the cap would
  // book a different invoice than the client sent; reject instead.
  if (body.items.length > 500) return bad('too-many-items')
  const itemsInput: Array<{ productId?: unknown; qty?: unknown; price?: unknown }> = body.items

  // resolve warehouse / parties upfront (outside tx) for speed.
  // An EXPLICIT warehouseId that does not resolve is a 400 — falling back
  // silently to the default warehouse books real goods into the wrong place.
  let warehouse: { id: string; name: string } | null = null
  const requestedWarehouseId = optStr(body.warehouseId)
  if (requestedWarehouseId) {
    warehouse = await db.warehouse.findFirst({
      where: { id: requestedWarehouseId, orgId: s.orgId },
      select: { id: true, name: true },
    })
    if (!warehouse) return bad('warehouse-not-found')
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

  // ONE batched level read for the whole cart (was a sequential N+1 probe per
  // item before the transaction).
  const levelRows = await db.stockLevel.findMany({
    where: { productId: { in: productIds }, warehouseId: warehouse.id },
    select: { productId: true, qty: true },
  })
  const levelMap = new Map(levelRows.map((l) => [l.productId, Number(l.qty)]))

  // Single org read for BOTH policy inputs (was two separate queries).
  const orgRow = await db.org.findUnique({
    where: { id: s.orgId },
    select: { allowNegativeStock: true, taxPercent: true },
  })
  const allowNegativeStock = orgRow?.allowNegativeStock ?? true

  // build normalized items — STRICTLY: every provided line must resolve to a
  // real product of this org with a positive qty. Silently dropping lines
  // (the old behavior) booked a total different from the client's cart.
  const normItems: Array<{
    productId: string; qty: number; price: number; costAtSale: number
    nameSnap: string; unitSnap: string | null; barcodeSnap: string | null
    warnNegative: boolean; currentQty: number
  }> = []
  const warnings: string[] = []
  for (const it of itemsInput) {
    const productId = str(it.productId)
    const product = pmap.get(productId)
    if (!product) return bad('items-invalid')
    const qty = num(it.qty, 0)
    if (qty <= 0) return bad('items-invalid')
    // Sanity cap: a 1e307 qty would poison stock math (Infinity on sum) and
    // every report downstream — reject the invoice instead of clamping money.
    if (qty > MAX_QTY) return bad('qty-too-large')
    const defaultPrice = type === 'SALE' ? Number(product.price) : Number(product.cost)
    const price = it.price !== undefined && it.price !== null && num(it.price, 0) >= 0 ? num(it.price, 0) : defaultPrice
    const currentQty = levelMap.get(productId) ?? 0
    let warnNegative = false
    if (product.trackStock) {
      if (type === 'SALE' && currentQty < qty) {
        warnNegative = true
        warnings.push(`${product.name}: ${currentQty} → ${round2(currentQty - qty)}`)
      }
    }
    normItems.push({
      productId,
      qty: round2(qty),
      price: round2(price),
      costAtSale: type === 'SALE' ? Number(product.cost) : round2(price),
      nameSnap: product.name,
      unitSnap: product.unit?.shortName ?? product.unit?.name ?? null,
      barcodeSnap: product.barcode,
      warnNegative,
      currentQty,
    })
  }

  const subtotal = round2(normItems.reduce((sum, it) => sum + it.qty * it.price, 0))
  let discount = money(body.discount, 0)
  discount = Math.min(discount, subtotal)
  // Tax percent must stay in a sane range — never negative, never above 100.
  const taxPercent = body.taxPercent !== undefined ? Math.min(100, Math.max(0, num(body.taxPercent, 0))) : undefined
  const taxPercentFinal = taxPercent !== undefined ? taxPercent : Number(orgRow?.taxPercent ?? 14)
  const taxAmount = round2(((subtotal - discount) * taxPercentFinal) / 100)
  const total = round2(subtotal - discount + taxAmount)
  const costTotal = round2(normItems.reduce((sum, it) => sum + it.qty * it.costAtSale, 0))

  let paidAmount = money(body.paidAmount, 0)
  paidAmount = Math.min(paidAmount, total)
  const paidMethod = ['CASH', 'BANK', 'CARD', 'WALLET'].includes(str(body.paidMethod)) ? str(body.paidMethod) : 'CASH'
  const status = paidAmount <= 0 ? 'UNPAID' : paidAmount >= total ? 'PAID' : 'PARTIAL'
  const notes = boundedStr(optStr(body.notes) ?? '', 2000) || null
  // safeDate bounds [2000, 2100]: a year-9999 document poisons every period
  // report; unparseable dates fall back to now (previous behavior preserved).
  const invoiceDate = safeDate(body.date) ?? new Date()
  const dueDate = safeDate(body.dueDate)
  if (optStr(body.dueDate) && !dueDate) return bad('invalid-due-date')

  let result
  try {
    result = await withIdempotency(req, s, 'invoice', async (clientOpId) => {
    // Document numbers are allocated OUTSIDE the write transaction: the
    // per-org Counter row is a hot lock — holding it for the whole tx
    // serialized every invoice/voucher/transfer of the tenant behind it.
    // Burning a number on a failed attempt is fine (gaps already happen on
    // rollback); uniqueness is enforced by @@unique([orgId, type, number]).
    const number = await nextDocNumber(db, s.orgId, type === 'SALE' ? 'INV' : 'PUR')
    const autoVoucherNumber = paidAmount > 0
      ? await nextDocNumber(db, s.orgId, type === 'SALE' ? 'RCV' : 'PMT')
      : null
    const snapshotName = paidAmount > 0
      ? type === 'SALE'
        ? (customerId ? ((await findCustomerName(db, s.orgId, customerId)) ?? 'عميل نقدي') : 'عميل نقدي')
        : (supplierId ? ((await findSupplierName(db, s.orgId, supplierId)) ?? 'مورد') : 'مورد')
      : null

    // PG-SAFE CRASH-WINDOW DEDUPE: a P2002 aborts a PostgreSQL transaction
    // (25P02 on any later statement), so the committed-invoice resolution
    // lives in the catch OUTSIDE the transaction (fresh connection).
    // withDbRetry re-runs the WHOLE attempt on deadlock/serialization aborts
    // (a fresh number is allocated per attempt — gaps are acceptable).
    let created: { invoice: Awaited<ReturnType<typeof db.invoice.create>> & { items: unknown[] }; voucherNumber: number | null }
    try {
    created = await withDbRetry(() => db.$transaction(async (tx) => {
    // CRASH-WINDOW DEDUPE: the scoped idempotency key is embedded in the
    // document inside the same transaction. If a previous attempt already
    // committed (crash after COMMIT, lost claim), the @@unique([orgId,
    // clientOperationId]) violation resolves to that invoice — no second one.
    const invoice = await tx.invoice.create({
        data: {
          orgId: s.orgId,
          number,
          type,
          status,
          clientOperationId: clientOpId,
          customerId: type === 'SALE' ? customerId : null,
          supplierId: type === 'PURCHASE' ? supplierId : null,
          warehouseId: warehouse!.id,
          userId: s.id,
          date: invoiceDate,
          dueDate,
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
    if (type === 'SALE' && !allowNegativeStock) {
      for (const it of normItems) {
        // ATOMIC negative-stock guard: the WHERE clause (qty >= requested) is
        // part of the UPDATE statement — no read-then-write race. 0 rows ⇒
        // insufficient stock (missing row = qty 0); the transaction rolls back.
        const cas = await tx.stockLevel.updateMany({
          where: { productId: it.productId, warehouseId: warehouse!.id, qty: { gte: it.qty } },
          data: { qty: { decrement: it.qty } },
        })
        if (cas.count === 0) throw new InsufficientStockError()
      }
    } else {
      // allowNegativeStock=true (default): documented behavior — sale may
      // drive stock below zero; the warning was collected in normItems.
      for (const it of normItems) {
        const delta = type === 'SALE' ? -it.qty : it.qty
        await tx.stockLevel.upsert({
          where: { productId_warehouseId: { productId: it.productId, warehouseId: warehouse!.id } },
          create: { productId: it.productId, warehouseId: warehouse!.id, qty: delta },
          update: { qty: { increment: delta } },
        })
      }
    }
    // Ledger: ONE batched write for all items (was a create per item).
    await tx.stockMovement.createMany({
      data: normItems.map((it) => ({
        orgId: s.orgId,
        productId: it.productId,
        warehouseId: warehouse!.id,
        qty: type === 'SALE' ? -it.qty : it.qty,
        kind: type,
        refType: 'INVOICE',
        refId: invoice.id,
        userId: s.id,
      })),
    })

    // latest purchase updates product cost (tenant-scoped write). Duplicate
    // lines of the SAME product collapse into one UPDATE per product — the
    // last line wins, matching the previous per-row loop's outcome exactly.
    if (type === 'PURCHASE') {
      const costByProduct = new Map<string, number>()
      for (const it of normItems) costByProduct.set(it.productId, it.price)
      for (const [productId, price] of costByProduct) {
        await tx.product.updateMany({ where: { id: productId, orgId: s.orgId }, data: { cost: price } })
      }
    }

    // auto payment voucher (number + party snapshot pre-resolved outside tx)
    if (paidAmount > 0) {
      await tx.voucher.create({
        data: {
          orgId: s.orgId,
          number: autoVoucherNumber!,
          type: type === 'SALE' ? 'RECEIPT' : 'PAYMENT',
          method: paidMethod,
          amount: paidAmount,
          partyType: type === 'SALE' ? (customerId ? 'CUSTOMER' : 'OTHER') : (supplierId ? 'SUPPLIER' : 'OTHER'),
          partyName: snapshotName,
          customerId: type === 'SALE' ? customerId : null,
          supplierId: type === 'PURCHASE' ? supplierId : null,
          invoiceId: invoice.id,
          note: boundedStr(`${type === 'SALE' ? 'دفعة على الفاتورة' : 'سداد للفاتورة'} رقم ${number}`, 500),
          userId: s.id,
          date: invoiceDate,
        },
      })
    }

    return { invoice, voucherNumber: paidAmount > 0 ? autoVoucherNumber! : null }
    }))
    } catch (e) {
      // This transaction rolled back; the duplicate (if any) was committed by
      // the ORIGINAL attempt — stock, cost and payment voucher are already
      // applied. Re-read the committed document on a fresh connection.
      if (clientOpId && isUniqueViolation(e, 'clientOperationId')) {
        const dup = await db.invoice.findFirst({
          where: { orgId: s.orgId, clientOperationId: clientOpId },
          include: { items: true },
        })
        if (dup) {
          const dupVoucher = await db.voucher.findFirst({
            where: { orgId: s.orgId, invoiceId: dup.id },
            select: { number: true },
          })
          // Same final shape as the success path below.
          return { id: dup.id, number: dup.number, voucherNumber: dupVoucher?.number ?? null }
        }
      }
      throw e
    }

    return {
      id: created.invoice.id,
      number: created.invoice.number,
      voucherNumber: created.voucherNumber,
    }
  })
  } catch (e) {
    // withIdempotency released the claim before rethrowing — the client can
    // retry the same key once stock is available.
    if (e instanceof InsufficientStockError) return bad('insufficient-stock', 409)
    throw e
  }

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

type CounterClient = { counter: { upsert: (args: {
  where: { orgId_docKey: { orgId: string; docKey: string } }
  create: { orgId: string; docKey: string; next: number }
  update: { next: { increment: number } }
}) => Promise<{ next: number }> } }

async function nextDocNumber(client: CounterClient, orgId: string, docKey: string): Promise<number> {
  const c = await client.counter.upsert({
    where: { orgId_docKey: { orgId, docKey } },
    create: { orgId, docKey, next: 2 },
    update: { next: { increment: 1 } },
  })
  return c.next - 1 || 1
}

function findCustomerName(client: typeof db, orgId: string, id: string | null) {
  if (!id) return Promise.resolve(null)
  return client.customer
    .findFirst({ where: { id, orgId }, select: { name: true } })
    .then((r: { name: string } | null) => r?.name ?? null)
}
function findSupplierName(client: typeof db, orgId: string, id: string | null) {
  if (!id) return Promise.resolve(null)
  return client.supplier
    .findFirst({ where: { id, orgId }, select: { name: true } })
    .then((r: { name: string } | null) => r?.name ?? null)
}
