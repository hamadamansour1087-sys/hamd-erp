import { createToken, hashPasswordAsync, sessionCookie, MAX_PASSWORD_LEN } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

import { str, boundedStr, rateLimit, clientIp, tooMany, readJson, isUniqueViolation } from '@/lib/api-helpers'

/** POST /api/auth/register — create a new tenant (org) + its ADMIN owner */
export async function POST(req: NextRequest) {
  try {
    // Anti-abuse: 5 registrations per hour per IP.
    if (!rateLimit(`register:${clientIp(req)}`, 5, 60 * 60_000)) return tooMany()

    // Body-size cap: pre-auth endpoint — never buffer a hostile multi-MB body.
    const body = await readJson(req, 64_000)
    const orgName = boundedStr(str(body.orgName), 200)
    const name = boundedStr(str(body.name), 200)
    const email = boundedStr(str(body.email).toLowerCase(), 200)
    const password = typeof body.password === 'string' ? body.password : ''

    if (!orgName || !name || !email || !password) {
      return NextResponse.json({ error: 'missing-fields' }, { status: 400 })
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'invalid-email' }, { status: 400 })
    }
    if (password.length < 6 || password.length > MAX_PASSWORD_LEN) {
      return NextResponse.json({ error: 'weak-password' }, { status: 400 })
    }

    // ENUMERATION/TIMING HARDENING: the scrypt hash now runs BEFORE the
    // email-exists check, so "email taken" and "email free" cost the same
    // CPU time — the fast-path oracle that made enumeration cheap is gone.
    const passwordHash = await hashPasswordAsync(password)

    const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      return NextResponse.json({ error: 'email-taken' }, { status: 409 })
    }

    try {
      const result = await db.$transaction(async (tx) => {
        const org = await tx.org.create({
          data: { name: orgName, currencyCode: 'EGP', taxPercent: 14 },
        })
        const user = await tx.user.create({
          data: {
            orgId: org.id,
            email,
            name,
            passwordHash,
            role: 'ADMIN',
          },
        })
        // starter data so a new tenant is usable immediately
        await tx.warehouse.create({
          data: { orgId: org.id, name: 'المخزن الرئيسي', isDefault: true },
        })
        await tx.unit.createMany({
          data: [
            { orgId: org.id, name: 'قطعة', shortName: 'pcs' },
            { orgId: org.id, name: 'كيلوجرام', shortName: 'kg' },
          ],
        })
        return { org, user }
      })

      const token = createToken(result.user.id, result.user.tokenVersion)
      const res = NextResponse.json({
        data: {
          user: {
            id: result.user.id,
            orgId: result.org.id,
            email: result.user.email,
            name: result.user.name,
            role: 'ADMIN',
          },
          org: {
            id: result.org.id,
            name: result.org.name,
            currencyCode: result.org.currencyCode,
            taxPercent: result.org.taxPercent,
            phone: result.org.phone,
            address: result.org.address,
            logo: result.org.logo,
          },
        },
      })
      res.cookies.set(sessionCookie(token))
      return res
    } catch (e) {
      // TOCTOU: two concurrent registrations for the same email — the
      // pre-check above is advisory; the DB unique constraint decides.
      if (isUniqueViolation(e)) {
        return NextResponse.json({ error: 'email-taken' }, { status: 409 })
      }
      throw e
    }
  } catch (e) {
    console.error('[auth/register]', e)
    return NextResponse.json({ error: 'server-error' }, { status: 500 })
  }
}
