import { createToken, hashPassword, sessionCookie } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

import { str } from '@/lib/api-helpers'

/** POST /api/auth/register — create a new tenant (org) + its ADMIN owner */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const orgName = str(body.orgName)
    const name = str(body.name)
    const email = str(body.email).toLowerCase()
    const password = typeof body.password === 'string' ? body.password : ''

    if (!orgName || !name || !email || !password) {
      return NextResponse.json({ error: 'missing-fields' }, { status: 400 })
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'invalid-email' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'weak-password' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      return NextResponse.json({ error: 'email-taken' }, { status: 409 })
    }

    const result = await db.$transaction(async (tx) => {
      const org = await tx.org.create({
        data: { name: orgName, currencyCode: 'EGP', taxPercent: 14 },
      })
      const user = await tx.user.create({
        data: {
          orgId: org.id,
          email,
          name,
          passwordHash: hashPassword(password),
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

    const token = createToken(result.user.id)
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
    console.error('[auth/register]', e)
    return NextResponse.json({ error: 'server-error' }, { status: 500 })
  }
}
