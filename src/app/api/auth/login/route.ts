import { createToken, sessionCookie, verifyPassword } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, clientIp, tooMany } from '@/lib/api-helpers'

import { str } from '@/lib/api-helpers'

/** POST /api/auth/login — issue session cookie for an active user (brute-force protected) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = str(body.email).toLowerCase()
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email || !password) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 })
    }

    // Anti brute-force: per-IP and per-account sliding windows.
    const ip = clientIp(req)
    if (!rateLimit(`login:ip:${ip}`, 20, 5 * 60_000) || !rateLimit(`login:acct:${email}`, 10, 5 * 60_000)) {
      return tooMany()
    }

    const user = await db.user.findUnique({
      where: { email },
      include: { org: true },
    })
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'invalid' }, { status: 401 })
    }
    const token = createToken(user.id, user.tokenVersion)
    const res = NextResponse.json({
      data: {
        user: {
          id: user.id,
          orgId: user.orgId,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        org: {
          id: user.org.id,
          name: user.org.name,
          currencyCode: user.org.currencyCode,
          taxPercent: user.org.taxPercent,
          phone: user.org.phone,
          address: user.org.address,
          logo: user.org.logo,
        },
      },
    })
    res.cookies.set(sessionCookie(token))
    return res
  } catch (e) {
    console.error('[auth/login]', e)
    return NextResponse.json({ error: 'server-error' }, { status: 500 })
  }
}
