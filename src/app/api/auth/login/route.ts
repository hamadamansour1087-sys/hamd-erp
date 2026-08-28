import { createToken, sessionCookie, verifyPasswordAsync } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, clientIp, tooMany, recordFailedLogin } from '@/lib/api-helpers'

import { str } from '@/lib/api-helpers'

/**
 * Pre-computed scrypt hash for the not-found path — burning the same KDF cost
 * when the email does not exist equalizes response timing so attackers cannot
 * enumerate registered accounts by measuring latency.
 */
const DUMMY_HASH = `${'0'.repeat(32)}:${'0'.repeat(128)}` // salt:hash shape; verify fails fast but scrypt still runs

/** POST /api/auth/login — issue session cookie for an active user (brute-force protected) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = str(body.email).toLowerCase()
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email || !password) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 })
    }

    // PRE-AUTH DoS DAMPER (per-IP, in-memory, best-effort): stops scrypt-cost
    // floods before any password work. NOT the brute-force control — the real
    // per-account cap is the DB-backed fail-only ledger below.
    const ip = clientIp(req)
    if (!rateLimit(`login:ip:${ip}`, 20, 5 * 60_000)) {
      return tooMany()
    }

    const user = await db.user.findUnique({
      where: { email },
      include: { org: true },
    })
    if (!user || !user.active || !(await verifyPasswordAsync(password, user.passwordHash))) {
      // Timing-equalize: always run one scrypt verification, even for unknown emails.
      if (!user) await verifyPasswordAsync(password, DUMMY_HASH)
      // DB-backed FAIL-ONLY per-account cap (multi-instance-safe, survives
      // restarts): an attacker spamming wrong passwords cannot lock the real
      // owner out — a request with the CORRECT password never reaches this
      // limiter and still succeeds, while brute-forcing stays capped at
      // 10 recorded fails / 5 min.
      if (!(await recordFailedLogin(email, ip))) {
        return tooMany()
      }
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
