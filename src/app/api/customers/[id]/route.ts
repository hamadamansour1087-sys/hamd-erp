import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, str, optStr, boundedStr, signedMoney, round2, forbidden, unauthorized, readJson, withDbRetry } from '@/lib/api-helpers'
import { singlePartyDues } from '@/lib/reports-utils'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



async function getCustomer(orgId: string, id: string) {
  return db.customer.findFirst({ where: { id, orgId } })
}

/**
 * GET /api/customers/[id] — profile + recent invoices + balance statement.
 *
 * BALANCE INTEGRITY: `owed` is computed by singlePartyDues() over the FULL set
 * of the customer's documents (same formula as partyDues() used by Dashboard/
 * Reports/Ledger — identical by construction). The `take: 50` list below is
 * presentation-only history and NEVER feeds the balance math.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const { id } = await ctx.params
  const customer = await getCustomer(s.orgId, id)
  if (!customer) return bad('not-found', 404)
  const [invoices, balance] = await Promise.all([
    db.invoice.findMany({
      where: { orgId: s.orgId, customerId: id, type: 'SALE' },
      orderBy: { date: 'desc' },
      take: 50,
      select: { id: true, number: true, date: true, total: true, paidAmount: true, status: true },
    }),
    singlePartyDues(s.orgId, 'customer', id),
  ])
  return ok({
    ...customer,
    owed: balance.owed,
    invoiceDues: balance.invoiceDues,
    // Standalone receipts + receipts on cancelled invoices (party credit) —
    // matches partyDues() credit semantics.
    standaloneReceipts: balance.voucherCredit,
    invoices,
  })
}

/** PUT /api/customers/[id] — CASHIER may edit contact info but NEVER openingBalance */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const { id } = await ctx.params
  const customer = await getCustomer(s.orgId, id)
  if (!customer) return bad('not-found', 404)
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
  // Tenant-scoped write (defense in depth on top of the guard above).
  const row = await db.customer.updateMany({ where: { id, orgId: s.orgId }, data })
  if (row.count === 0) return bad('not-found', 404)
  return ok(await getCustomer(s.orgId, id))
}

/**
 * DELETE /api/customers/[id] — staff only.
 * RACE-SAFE: the usage pre-check and the delete run inside ONE Serializable
 * transaction. In the old read-then-delete (both autocommit) an invoice or
 * voucher landing between the check and the delete silently unlinked the
 * customer (onDelete: SetNull) — history rewritten without an error.
 * Serializable isolation makes PostgreSQL abort the losing writer (P2034),
 * which withDbRetry surfaces as a retry and finally an honest failure.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const { id } = await ctx.params
  const customer = await getCustomer(s.orgId, id)
  if (!customer) return bad('not-found', 404)
  try {
    await withDbRetry(() =>
      db.$transaction(
        async (tx) => {
          const used = await tx.invoice.count({ where: { orgId: s.orgId, customerId: id } })
          if (used > 0) return 'in-use' as const
          await tx.customer.deleteMany({ where: { id, orgId: s.orgId } })
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

