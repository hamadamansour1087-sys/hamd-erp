import { getSession, hashPassword } from '@/lib/auth'
import { ok, bad, str, unauthorized, forbidden } from '@/lib/api-helpers'
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
  const name = str(body.name)
  const email = str(body.email).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  const role = ['ADMIN', 'MANAGER', 'CASHIER'].includes(str(body.role)) ? str(body.role) : 'CASHIER'
  if (!name || !email || password.length < 6) return bad('missing-fields')

  const exists = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (exists) return bad('email-taken')

  const row = await db.user.create({
    data: { orgId: s.orgId, name, email, passwordHash: hashPassword(password), role },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  })
  return ok(row)
}
