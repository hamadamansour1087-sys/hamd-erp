import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, unauthorized, forbidden } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/** GET /api/settings/template — stored designer template JSON or null for defaults */
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

/** PUT /api/settings/template — save full designer blob (staff only) */
export async function PUT(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return bad('template-invalid')
  try {
    const json = JSON.stringify(body)
    if (json.length > 200_000) return bad('too-large')
    await db.org.update({ where: { id: s.orgId }, data: { invoiceTemplate: json } })
    return ok({ saved: true })
  } catch {
    return bad('server-error', 500)
  }
}
