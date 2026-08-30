import { getSession, isStaff } from '@/lib/auth'
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
  safeDate,
  readJson,
  withDbRetry,
  withIdempotency,
  okIdempotent,
  isUniqueViolation,
  OperationConflictError,
} from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/** GET /api/vouchers?type=RECEIPT|PAYMENT&q=&customerId=&supplierId=&from=&to=&page=&pageSize= */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const sp = req.nextUrl.searchParams
  const type = sp.get('type') === 'PAYMENT' ? 'PAYMENT' : 'RECEIPT'
  const q = boundedStr(sp.get('q'), 100)
  const customerId = sp.get('customerId') || undefined
  const supplierId = sp.get('supplierId') || undefined
  const from = sp.get('from')
  const to = sp.get('to')
  const page = Math.max(1, Math.floor(num(sp.get('page'), 1)))
  const pageSize = Math.min(200, Math.max(5, Math.floor(num(sp.get('pageSize'), 25))))

  const where: Record<string, unknown> = { orgId: s.orgId, type }
  if (customerId) where.customerId = customerId
  if (supplierId) where.supplierId = supplierId
  const range: Record<string, Date> = {}
  if (from && !isNaN(new Date(from).getTime())) range.gte = new Date(from)
  if (to && !isNaN(new Date(to).getTime())) range.lte = new Date(new Date(to).getTime() + 86_399_000)
  if (Object.keys(range).length) where.date = range
  if (/^\d+$/.test(q)) {
    // Int4 overflow guard (same as invoices GET).
    const n = Number(q)
    if (!(Number.isSafeInteger(n) && n >= 1 && n <= 2_147_483_647)) {
      return ok({ total: 0, page, pageSize, rows: [] })
    }
    where.number = n
  } else if (q) where.partyName = { contains: q, mode: 'insensitive' }

  const [total, rows] = await Promise.all([
    db.voucher.count({ where }),
    db.voucher.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { invoice: { select: { number: true, type: true } } },
    }),
  ])

  return ok({
    total,
    page,
    pageSize,
    rows: rows.map((v) => ({
      id: v.id,
      number: v.number,
      type: v.type,
      method: v.method,
      amount: v.amount,
      partyType: v.partyType,
      partyName: v.partyName,
      customerId: v.customerId,
      supplierId: v.supplierId,
      invoiceId: v.invoiceId,
      invoiceNumber: v.invoice?.number ?? null,
      note: v.note,
      date: v.date.toISOString(),
    })),
  })
}

/**
 * POST /api/vouchers — manual receipt/payment.
 * body { type:'RECEIPT'|'PAYMENT', amount, method?, partyType?, customerId?|supplierId?,
 *        invoiceId?, note?, date? }
 * When invoiceId given → adds to that invoice's paidAmount & recomputes its status.
 *
 * Financial integrity notes:
 *  - CASHIER may take customer RECEIPTS (POS); PAYMENT (supplier payouts) is staff-only.
 *  - paidAmount is updated with a compare-and-swap loop *inside* the transaction:
 *    two concurrent payments can never silently overwrite each other (lost update).
 */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const body = await readJson(req)
  const type = body.type === 'PAYMENT' ? 'PAYMENT' : 'RECEIPT'
  // Authorization (server-side): cashier takes receipts; supplier payouts are staff-only.
  if (type === 'PAYMENT' && !isStaff(s)) return forbidden()

  const amount = round2(money(body.amount, 0))
  if (!(amount > 0)) return bad('amount-required')
  const method = ['CASH', 'BANK', 'CARD', 'WALLET'].includes(str(body.method)) ? str(body.method) : 'CASH'
  const invoiceId = optStr(body.invoiceId)
  const customerId = optStr(body.customerId)
  const supplierId = optStr(body.supplierId)
  // R3-3: cross-type party ids are a client bug — reject LOUDLY instead of
  // resolving the party, snapshotting its name, and then silently DROPPING the
  // FK link (a RECEIPT used to store partyType=SUPPLIER with supplierId=NULL).
  // The UI never sends cross-type ids (finance-parts picks customerId for
  // receipts / supplierId for payments), so this only ever fires for hostile
  // or broken clients.
  if (type === 'RECEIPT' && supplierId) return bad('party-type-mismatch')
  if (type === 'PAYMENT' && customerId) return bad('party-type-mismatch')

  // TENANT-SAFETY: party references must belong to the caller's org. The FK
  // alone would happily accept another tenant's id (existence ≠ ownership).
  // The DB name is captured here too — it is the authoritative party snapshot
  // (anti-spoofing): a client-supplied partyName must never override it.
  let linkedPartyName: string | null = null
  if (customerId) {
    const c = await db.customer.findFirst({ where: { id: customerId, orgId: s.orgId }, select: { name: true } })
    if (!c) return bad('customer-not-found')
    linkedPartyName = c.name
  }
  if (supplierId) {
    const sup = await db.supplier.findFirst({ where: { id: supplierId, orgId: s.orgId }, select: { name: true } })
    if (!sup) return bad('supplier-not-found')
    linkedPartyName = sup.name
  }

  // Validate the linked invoice up-front (existence/type/state) — the money math
  // itself happens inside the transaction below.
  if (invoiceId) {
    const inv = await db.invoice.findFirst({
      where: { id: invoiceId, orgId: s.orgId },
      select: { id: true, status: true, type: true },
    })
    if (!inv) return bad('invoice-not-found')
    if (inv.status === 'CANCELLED') return bad('invoice-cancelled')
    const expectLinked = type === 'RECEIPT' ? 'SALE' : 'PURCHASE'
    if (inv.type !== expectLinked) return bad('invoice-type-mismatch')
  }

  try {
    const result = await withIdempotency(req, s, 'voucher', async (clientOpId) => {
      // Counter allocated OUTSIDE the tx (hot-row contention) + party snapshot.
      const c = await db.counter.upsert({
        where: { orgId_docKey: { orgId: s.orgId, docKey: type === 'RECEIPT' ? 'RCV' : 'PMT' } },
        create: { orgId: s.orgId, docKey: type === 'RECEIPT' ? 'RCV' : 'PMT', next: 2 },
        update: { next: { increment: 1 } },
      })
      const number = c.next - 1 || 1

      // PARTY-NAME ANTI-SPOOFING: when a party is linked, the DB name is the
      // voucher's identity — a client-supplied partyName used to override it,
      // letting a cashier print a receipt "from" any party label. Free text is
      // honored only for walk-in (no-party) vouchers.
      // partyType normalization preserved verbatim from the prior behavior
      // (linked party wins; SUPPLIER takes precedence if both ids are sent).
      const partyType: string = supplierId
        ? 'SUPPLIER'
        : customerId
          ? 'CUSTOMER'
          : (() => {
              const t = str(body.partyType) || 'OTHER'
              return ['CUSTOMER', 'SUPPLIER', 'OTHER'].includes(t) ? t : 'OTHER'
            })()
      const freeName = boundedStr(optStr(body.partyName) ?? '', 200) || null
      const partyName = linkedPartyName ?? freeName

      // PG-SAFE CRASH-WINDOW DEDUPE: a P2002 aborts a PostgreSQL transaction
      // (25P02 on any later statement), so the committed-duplicate resolution
      // lives in the catch OUTSIDE the transaction (fresh connection).
      let created: Awaited<ReturnType<typeof db.voucher.create>>
      try {
      created = await withDbRetry(() => db.$transaction(async (tx) => {
      // CRASH-WINDOW DEDUPE: the scoped idempotency key is embedded in the
      // document inside the same transaction (@@unique per org). A retry after
      // a post-COMMIT crash resolves to the committed voucher — and skips the
      // paidAmount application below (already applied by the original attempt).
      const voucher = await tx.voucher.create({
          data: {
            orgId: s.orgId,
            number,
            type,
            method,
            amount,
            clientOperationId: clientOpId,
            partyType,
            partyName: partyName ?? (type === 'RECEIPT' ? 'سند قبض نقدي' : 'سند صرف'),
            customerId: type === 'RECEIPT' ? customerId : null,
            supplierId: type === 'PAYMENT' ? supplierId : null,
            invoiceId,
            note: boundedStr(optStr(body.note) ?? '', 1000) || null,
            userId: s.id,
            date: safeDate(body.date) ?? new Date(),
          },
        })

      if (invoiceId) {
        // Compare-and-swap: re-read paidAmount AND status inside the write
        // transaction and only apply when both are unchanged — concurrent
        // payments retry instead of clobbering, and a concurrent CANCEL is
        // refused instead of writing money onto a cancelled document.
        // OVERPAYMENT REJECTION: amount beyond the remaining due is a client bug
        // or a race (another payment landed first) — reject with 409.
        for (let attempt = 0; ; attempt++) {
          const inv = await tx.invoice.findUnique({
            where: { id: invoiceId },
            select: { total: true, paidAmount: true, status: true },
          })
          if (!inv) throw new OperationConflictError('invoice-vanished')
          if (inv.status === 'CANCELLED') throw new OperationConflictError('invoice-cancelled')
          if (round2(Number(inv.paidAmount) + amount) > round2(Number(inv.total) + 0.001)) {
            throw new OperationConflictError('amount-exceeds-due')
          }
          const newPaid = round2(Number(inv.paidAmount) + amount)
          const status = newPaid <= 0 ? 'UNPAID' : newPaid >= Number(inv.total) ? 'PAID' : 'PARTIAL'
          const upd = await tx.invoice.updateMany({
            where: { id: invoiceId, paidAmount: inv.paidAmount, status: { not: 'CANCELLED' } },
            data: { paidAmount: newPaid, status },
          })
          if (upd.count === 1) break
          if (attempt >= 10) throw new OperationConflictError('paid-amount-conflict')
        }
      }
      return voucher
      }))
      } catch (e) {
        // This transaction rolled back; the duplicate (if any) was committed by
        // the ORIGINAL attempt — its paidAmount effects are already applied.
        if (clientOpId && isUniqueViolation(e, 'clientOperationId')) {
          const dup = await db.voucher.findFirst({ where: { orgId: s.orgId, clientOperationId: clientOpId } })
          if (dup) return dup
        }
        throw e
      }
      return created
  })

  // withIdempotency releases the claim when the handler throws — map typed
  // conflicts to 409 (client can adjust and retry) instead of an opaque 500.
  if (result instanceof Response) return result
  return okIdempotent(result)
  } catch (e) {
    if (e instanceof OperationConflictError) return bad(e.message, 409)
    throw e
  }
}
