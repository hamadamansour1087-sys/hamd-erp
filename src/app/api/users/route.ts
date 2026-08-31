import { getSession, hashPasswordAsync, MAX_PASSWORD_LEN } from '@/lib/auth'
import { ok, bad, str, unauthorized, forbidden, boundedStr, isUniqueViolation, readJson, rateLimit, tooMany, clientIp } from '@/lib/api-helpers'
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
    take: 5000, // bounded-list policy
  })
  return ok(rows)
}

/** POST /api/users — ADMIN invites a user. body { name, email, password, role? } */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (s.role !== 'ADMIN') return forbidden()
  // Enumeration damper: emails are globally unique by design, so the
  // 'email-taken' answer inevitably leaks "this email exists somewhere". Cap
  // how often an account can probe that signal through the invite endpoint.
  if (!rateLimit(`users:invite:${clientIp(req)}`, 20, 5 * 60_000)) return tooMany()
  const body = await readJson(req)
  const name = boundedStr(body.name, 200)
  const email = boundedStr(str(body.email).toLowerCase(), 200)
  const password = typeof body.password === 'string' ? body.password : ''
  const role = ['ADMIN', 'MANAGER', 'CASHIER'].includes(str(body.role)) ? str(body.role) : 'CASHIER'
  if (!name || !email || password.length < 6) return bad('missing-fields')
  // Minimal RFC-style shape — an unvalidated string here used to accept 'ab'.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('invalid-email')
  if (password.length > MAX_PASSWORD_LEN) return bad('weak-password')

  // No find-first pre-check: emails are GLOBALLY unique, so the pre-check both
  // raced concurrent invites and served as a cheap cross-org enumeration
  // oracle. The DB unique constraint is the source of truth — the catch below
  // answers the identical 400 'email-taken' either way.
  try {
    const row = await db.user.create({
      data: { orgId: s.orgId, name, email, passwordHash: await hashPasswordAsync(password), role },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    })
    return ok(row)
  } catch (e) {
    // Race / duplicate: the DB unique constraint decides. 400, not 500.
    if (isUniqueViolation(e)) return bad('email-taken')
    throw e
  }
}
