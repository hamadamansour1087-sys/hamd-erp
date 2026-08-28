import { getSession } from '@/lib/auth'
import { ok, unauthorized } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/settings/template — stored invoice print template JSON or null for
 * defaults. Read-only: the invoice designer was removed, so there is no
 * writer anymore; this endpoint stays so the print engine
 * (loadResolvedTemplate) keeps honoring an existing stored template.
 */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const org = await db.org.findUnique({
    where: { id: s.orgId },
    select: { invoiceTemplate: true },
  })
  let template: unknown = null
  try {
    template = org?.invoiceTemplate ? JSON.parse(org.invoiceTemplate) : null
  } catch {
    template = null
  }
  return ok(template)
}
