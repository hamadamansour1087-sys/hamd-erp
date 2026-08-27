import { getSession } from '@/lib/auth'
import { NextRequest } from 'next/server'

import { unauthorized } from '@/lib/api-helpers'
import { ok } from '@/lib/api-helpers'
import { partyDues } from '@/lib/reports-utils'

/** GET /api/reports/balances — receivables (customers) + payables (suppliers) lists. */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const dues = await partyDues(s.orgId)
  return ok({
    customers: dues.customerRows.filter((c) => Math.abs(c.owed) > 0.009).sort((a, b) => b.owed - a.owed),
    suppliers: dues.supplierRows.filter((c) => Math.abs(c.owed) > 0.009).sort((a, b) => b.owed - a.owed),
    totals: { receivables: dues.receivables, payables: dues.payables },
  })
}
