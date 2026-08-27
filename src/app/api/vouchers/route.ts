import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, str, optStr, num, round2, unauthorized, forbidden } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/** GET /api/vouchers?type=RECEIPT|PAYMENT&q=&customerId=&supplierId=&from=&to=&page=&pageSize= */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const sp = req.nextUrl.searchParams
  const type = sp.get('type') === 'PAYMENT' ? 'PAYMENT' : 'RECEIPT'
  const q = str(sp.get('q'))
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
  if (/^\d+$/.test(q)) where.number = parseInt(q, 10)
  else if (q) where.partyName = { contains: q }

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
 */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const type = body.type === 'PAYMENT' ? 'PAYMENT' : 'RECEIPT'
  const amount = num(body.amount, 0)
  if (!(amount > 0)) return bad('amount-required')
  const method = ['CASH', 'BANK', 'CARD', 'WALLET'].includes(str(body.method)) ? str(body.method) : 'CASH'
  const invoiceId = optStr(body.invoiceId)
  const customerId = optStr(body.customerId)
  const supplierId = optStr(body.supplierId)

  let invoiceUpdate: { applyTo: { id: string; number: number; currentPaid: number; total: number } | null } = {
    applyTo: null,
  }
  if (invoiceId) {
    const inv = await db.invoice.findFirst({
      where: { id: invoiceId, orgId: s.orgId },
      select: { id: true, number: true, status: true, paidAmount: true, total: true, type: true },
    })
    if (!inv) return bad('invoice-not-found')
    if (inv.status === 'CANCELLED') return bad('invoice-cancelled')
    const expectLinked = type === 'RECEIPT' ? 'SALE' : 'PURCHASE'
    if (inv.type !== expectLinked) return bad('invoice-type-mismatch')
    invoiceUpdate.applyTo = { id: inv.id, number: inv.number, currentPaid: inv.paidAmount, total: inv.total }
  }

  const created = await db.$transaction(async (tx) => {
    const c = await tx.counter.upsert({
      where: { orgId_docKey: { orgId: s.orgId, docKey: type === 'RECEIPT' ? 'RCV' : 'PMT' } },
      create: { orgId: s.orgId, docKey: type === 'RECEIPT' ? 'RCV' : 'PMT', next: 2 },
      update: { next: { increment: 1 } },
    })
    const number = c.next - 1 || 1

    let partyName = optStr(body.partyName)
    let partyType: string = str(body.partyType) || 'OTHER'
    if (customerId) {
      partyType = 'CUSTOMER'
      if (!partyName) {
        const cust = await tx.customer.findFirst({ where: { id: customerId, orgId: s.orgId }, select: { name: true } })
        partyName = cust?.name ?? null
      }
    }
    if (supplierId) {
      partyType = 'SUPPLIER'
      if (!partyName) {
        const sup = await tx.supplier.findFirst({ where: { id: supplierId, orgId: s.orgId }, select: { name: true } })
        partyName = sup?.name ?? null
      }
    }

    const voucher = await tx.voucher.create({
      data: {
        orgId: s.orgId,
        number,
        type,
        method,
        amount,
        partyType,
        partyName: partyName ?? (type === 'RECEIPT' ? 'سند قبض نقدي' : 'سند صرف'),
        customerId: type === 'RECEIPT' ? customerId : null,
        supplierId: type === 'PAYMENT' ? supplierId : null,
        invoiceId,
        note: optStr(body.note),
        userId: s.id,
        date: typeof body.date === 'string' && !isNaN(new Date(body.date).getTime()) ? new Date(body.date) : new Date(),
      },
    })

    if (invoiceUpdate.applyTo) {
      const newPaid = round2(Math.min(invoiceUpdate.applyTo.total, invoiceUpdate.applyTo.currentPaid + amount))
      const status = newPaid <= 0 ? 'UNPAID' : newPaid >= invoiceUpdate.applyTo.total ? 'PAID' : 'PARTIAL'
      await tx.invoice.update({ where: { id: invoiceUpdate.applyTo.id }, data: { paidAmount: newPaid, status } })
    }
    return voucher
  })

  return ok(created)
}
