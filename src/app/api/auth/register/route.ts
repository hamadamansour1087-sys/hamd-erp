import { hashPasswordAsync, MAX_PASSWORD_LEN } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

import { str, boundedStr, rateLimit, clientIp, tooMany, readJson, isUniqueViolation } from '@/lib/api-helpers'
import { TRIAL_DAYS } from '@/lib/tenant'

/** Phone normalization for the registration contact field: digits, spaces,
 *  dashes and a leading + only — enough for any real number, useless for XSS. */
function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+\-\s()]/g, '').trim().slice(0, 30)
}

/**
 * POST /api/auth/register — submit a new tenant (org) + its ADMIN owner.
 *
 * SUBSCRIPTION CONTROL: registration NO LONGER grants access. The org is
 * created as PENDING and NO session cookie is issued — the caller stays on
 * the marketing/auth screen with a "under review" confirmation. Access is
 * granted exclusively from the platform console (SUPERADMIN): approve →
 * TRIAL (TRIAL_DAYS with usage caps) or activate → ACTIVE. Until then the
 * central session gate (lib/auth.getSession) and the login check refuse
 * every request for this org.
 */
export async function POST(req: NextRequest) {
  try {
    // Anti-abuse: 5 registrations per hour per IP.
    if (!rateLimit(`register:${clientIp(req)}`, 5, 60 * 60_000)) return tooMany()

    // Body-size cap: pre-auth endpoint — never buffer a hostile multi-MB body.
    const body = await readJson(req, 64_000)
    const orgName = boundedStr(str(body.orgName), 200)
    const name = boundedStr(str(body.name), 200)
    const email = boundedStr(str(body.email).toLowerCase(), 200)
    const phone = normalizePhone(str(body.phone))
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
      await db.$transaction(async (tx) => {
        const org = await tx.org.create({
          data: {
            name: orgName,
            currencyCode: 'EGP',
            taxPercent: 14,
            phone: phone || null,
            // LIFECYCLE: every new tenant starts pending company approval.
            status: 'PENDING',
            // Stamped at approval time from the platform console.
            trialEndsAt: null,
            approvedAt: null,
          },
        })
        await tx.user.create({
          data: {
            orgId: org.id,
            email,
            name,
            passwordHash,
            role: 'ADMIN',
          },
        })
        // starter data so the org is usable the moment it is approved
        await tx.warehouse.create({
          data: { orgId: org.id, name: 'المخزن الرئيسي', isDefault: true },
        })
        await tx.unit.createMany({
          data: [
            { orgId: org.id, name: 'قطعة', shortName: 'pcs' },
            { orgId: org.id, name: 'كيلوجرام', shortName: 'kg' },
          ],
        })
      })

      // 201 + explicit pending flag — deliberately NO token, NO cookie.
      return NextResponse.json(
        {
          data: {
            pending: true,
            message: 'registration-received',
            trialDays: TRIAL_DAYS,
          },
        },
        { status: 201 }
      )
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
