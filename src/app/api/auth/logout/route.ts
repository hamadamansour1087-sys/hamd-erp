import { clearedCookie } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * POST /api/auth/logout — clear the session cookie AND revoke the token
 * server-side (tokenVersion bump). Previously logout only dropped the
 * client-side cookie: a stolen token stayed valid for up to 30 days. The
 * bump invalidates every token of THIS user (they are logging out; no other
 * account is affected) and the session cache is dropped immediately.
 */
export async function POST(req: NextRequest) {
  try {
    const s = await getSession(req)
    if (s) {
      await db.user
        .updateMany({ where: { id: s.id, orgId: s.orgId }, data: { tokenVersion: { increment: 1 } } })
        .catch(() => undefined)
    }
  } catch {
    // Logout must never fail hard — the cookie is cleared regardless.
  }
  const res = NextResponse.json({ data: { ok: true } })
  res.cookies.set(clearedCookie())
  return res
}
