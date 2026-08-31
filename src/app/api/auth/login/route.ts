import { createToken, sessionCookie, verifyPasswordAsync, MAX_PASSWORD_LEN } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, clientIp, tooMany, recordFailedLogin, readJson, boundedStr } from '@/lib/api-helpers'
import { accessState } from '@/lib/tenant'

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
      include: { org: { select: {
        id: true, name: true, currencyCode: true, taxPercent: true,
        phone: true, address: true, logo: true, status: true, trialEndsAt: true,
      } } },
    })
    // Timing-equalize across ALL failure shapes: an existing-but-DISABLED
    // account must burn the same scrypt cost as an active one. Short-circuiting
    // on !active (skipping the KDF) made the fast response a boolean oracle
    // revealing whether an email belongs to a disabled account.
    const verified = user ? await verifyPasswordAsync(password, user.passwordHash) : false
    if (!user || !user.active || !verified) {
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
    // TENANT LIFECYCLE GATE — correct credentials are NOT enough. A pending
    // (unapproved), suspended, or expired-trial org cannot log in; the caller
    // gets a specific error code so the UI can say WHY. Deliberately placed
    // AFTER full credential verification: the response timing stays equal to
    // the success path and no oracle reveals an org's status to someone who
    // does not know the password.
    const access = accessState(user.org)
    if (!access.ok) {
      return NextResponse.json({ error: access.code }, { status: 403 })
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
          status: user.org.status,
          trialEndsAt: user.org.trialEndsAt,
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
