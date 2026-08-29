import { createToken, sessionCookie, verifyPasswordAsync, MAX_PASSWORD_LEN } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, clientIp, tooMany, recordFailedLogin, readJson, boundedStr } from '@/lib/api-helpers'

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
    // Body-size cap: pre-auth endpoint — a multi-MB JSON body must never be
    // fully buffered (memory DoS), and scrypt must never digest one either.
    const body = await readJson(req, 64_000)
    const email = boundedStr(str(body.email).toLowerCase(), 200)
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email || !password) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 })
    }
    // scrypt cost scales with input size — cap password material at a length
    // far beyond any human password (a 10MB "password" is a CPU-burn attack).
    if (password.length > MAX_PASSWORD_LEN) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 })
    }

    // PRE-AUTH scrypt-cost DAMPER (per-IP, in-memory, best-effort): caps the
    // CPU burn of password floods BEFORE any password work. High enough that
    // no realistic office hits it; the REAL brute-force control is the
    // DB-backed fail-only ledger (per-account AND per-ip) below.
    const ip = clientIp(req)
    if (!rateLimit(`login:ip:${ip}`, 300, 5 * 60_000)) {
      return tooMany()
    }

    const user = await db.user.findUnique({
      where: { email },
      include: { org: true },
    })
    if (!user || !user.active || !(await verifyPasswordAsync(password, user.passwordHash))) {
      // Timing-equalize: always run one scrypt verification, even for unknown emails.
      if (!user) await verifyPasswordAsync(password, DUMMY_HASH)
      // DB-backed FAIL-ONLY caps (multi-instance-safe, survives restarts):
      // per-ACCOUNT 10 failures / 5 min AND per-IP 20 failures / 5 min.
      // Successful logins are never recorded — a correct password can never
      // be locked out by an attacker spamming the same address.
      const budget = await recordFailedLogin(email, ip)
      if (!budget.acct || !budget.ip) {
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
