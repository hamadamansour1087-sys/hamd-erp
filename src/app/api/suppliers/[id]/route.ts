import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, str, optStr, boundedStr, signedMoney, round2, forbidden, unauthorized, readJson, withDbRetry } from '@/lib/api-helpers'
import { singlePartyDues } from '@/lib/reports-utils'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



async function getSupplier(orgId: string, id: string) {
  return db.supplier.findFirst({ where: { id, orgId } })
}

/**
 * GET /api/suppliers/[id] — profile + recent purchases + owed.
 *
 * BALANCE INTEGRITY: `owed` comes from singlePartyDues() over the FULL set of
 * documents (same formula as partyDues() used by Dashboard/Reports/Ledger —
 * identical by construction). `take: 50` is presentation-only history.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const { id } = await ctx.params
  const supplier = await getSupplier(s.orgId, id)
  if (!supplier) return bad('not-found', 404)
  const [invoices, balance] = await Promise.all([
    db.invoice.findMany({
      where: { orgId: s.orgId, supplierId: id, type: 'PURCHASE' },
      orderBy: { date: 'desc' },
      take: 50,
      select: { id: true, number: true, date: true, total: true, paidAmount: true, status: true },
    }),
    singlePartyDues(s.orgId, 'supplier', id),
  ])
  return ok({
    ...supplier,
    owed: balance.owed,
    invoiceDues: balance.invoiceDues,
    // Standalone payments + payments on cancelled invoices (party credit).
    standalonePayments: balance.voucherCredit,
    invoices,
  })
}

/** PUT /api/suppliers/[id] — CASHIER may edit contact info but NEVER openingBalance */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const { id } = await ctx.params
  const supplier = await getSupplier(s.orgId, id)
  if (!supplier) return bad('not-found', 404)
  const body = await readJson(req)
  const data: Record<string, unknown> = {}
  if (str(body.name)) data.name = boundedStr(str(body.name), 200)
  ;(['phone', 'address', 'notes'] as const).forEach((k) => {
    if (body[k] !== undefined) data[k] = boundedStr(optStr(body[k]), k === 'phone' ? 100 : k === 'address' ? 1000 : 2000) || null
  })
  // Financial field: only staff may touch the opening balance (server-enforced).
  if (body.openingBalance !== undefined) {
    if (!isStaff(s)) return forbidden()
    data.openingBalance = round2(signedMoney(body.openingBalance, 0))
  }
  const row0 = await db.supplier.updateMany({ where: { id, orgId: s.orgId }, data })
  if (row0.count === 0) return bad('not-found', 404)
  return ok(await getSupplier(s.orgId, id))
}

/**
 * DELETE /api/suppliers/[id] — staff only. Serializable check+delete (see
 * the twin note in customers/[id]): an invoice landing between the usage
 * count and the delete can no longer silently SetNull the supplier link.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const supplier = await getSupplier(s.orgId, id)
  if (!supplier) return bad('not-found', 404)
  try {
    await withDbRetry(() =>
      db.$transaction(
        async (tx) => {
          const used = await tx.invoice.count({ where: { orgId: s.orgId, supplierId: id } })
          if (used > 0) return 'in-use' as const
          await tx.supplier.deleteMany({ where: { id, orgId: s.orgId } })
          return 'deleted' as const
        },
        { isolationLevel: 'Serializable' }
      )
    ).then((r) => {
      if (r === 'in-use') throw new Error('in-use')
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'in-use') return bad('in-use', 409)
    throw e
  }
  return ok({ id })
}

