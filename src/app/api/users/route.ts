import { getSession, hashPasswordAsync } from '@/lib/auth'
import { ok, bad, str, unauthorized, forbidden, boundedStr, isUniqueViolation } from '@/lib/api-helpers'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'



/** GET /api/users — staff can list; only admins manage */
export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (s.role === 'CASHIER') return forbidden()
  const rows = await db.user.findMany({
    where: { orgId: s.orgId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  })
  return ok(rows)
}

/** POST /api/users — ADMIN invites a user. body { name, email, password, role? } */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (s.role !== 'ADMIN') return forbidden()
  const body = await req.json().catch(() => ({}))
  const name = boundedStr(body.name, 200)
  const email = boundedStr(str(body.email).toLowerCase(), 200)
  const password = typeof body.password === 'string' ? body.password : ''
  const role = ['ADMIN', 'MANAGER', 'CASHIER'].includes(str(body.role)) ? str(body.role) : 'CASHIER'
  if (!name || !email || password.length < 6) return bad('missing-fields')
  // Minimal RFC-style shape — an unvalidated string here used to accept 'ab'.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('invalid-email')

  const exists = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (exists) return bad('email-taken')

  try {
    const row = await db.user.create({
      data: { orgId: s.orgId, name, email, passwordHash: await hashPasswordAsync(password), role },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    })
    return ok(row)
  } catch (e) {
    // Race: two concurrent invites for the same email — the pre-check above is
    // advisory; the DB unique constraint is the source of truth. 400, not 500.
    if (isUniqueViolation(e)) return bad('email-taken')
    throw e
  }
}
