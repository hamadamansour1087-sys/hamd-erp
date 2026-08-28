import { getSession, isStaff } from '@/lib/auth'
import { ok, bad, str, optStr, num, unauthorized, forbidden } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



const CURRENCY_WHITELIST = ['EGP', 'SAR', 'AED', 'USD', 'EUR', 'KWD', 'QAR', 'JOD']

/** PUT /api/settings/org — admin/manager update of tenant profile */
export async function PUT(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()
  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  if (str(body.name)) data.name = str(body.name)

  const currency = str(body.currencyCode).toUpperCase()
  if (currency) {
    if (!CURRENCY_WHITELIST.includes(currency)) return bad('invalid-currency')
    data.currencyCode = currency
  }

  if (body.taxPercent !== undefined) {
    const tax = num(body.taxPercent, -1)
    if (tax < 0 || tax > 100) return bad('invalid-tax')
    data.taxPercent = tax
  }

  // Server-side negative-stock policy switch (see Org model docs).
  if (body.allowNegativeStock !== undefined) {
    if (typeof body.allowNegativeStock !== 'boolean') return bad('invalid-allow-negative-stock')
    data.allowNegativeStock = body.allowNegativeStock
  }

  ;['phone', 'address'].forEach((k) => {
    if (body[k] !== undefined) data[k] = optStr(body[k])
  })

  // logo as data URL only — remote http(s) URLs are rejected so the server never
  // fetches attacker-controlled URLs (SSRF hardening at the source).
  if (body.logo !== undefined) {
    const logo = optStr(body.logo)
    if (logo && (logo.length > 600_000 || !logo.startsWith('data:image/'))) {
      return bad('invalid-logo')
    }
    data.logo = logo
  }

  await db.org.update({ where: { id: s.orgId }, data })
  const org = await db.org.findUnique({
    where: { id: s.orgId },
    select: { id: true, name: true, currencyCode: true, taxPercent: true, phone: true, address: true, logo: true, allowNegativeStock: true },
  })
  return ok(org)
}

/** GET /api/settings/org */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  const org = await db.org.findUnique({
    where: { id: s.orgId },
    select: { id: true, name: true, currencyCode: true, taxPercent: true, phone: true, address: true, logo: true, allowNegativeStock: true },
  })
  return ok(org)
}
