import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import type { SessionUser } from '@/lib/types'

const COOKIE_NAME = 'session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

/**
 * AUTH_SECRET — resolved lazily and never hardcoded.
 * Production MUST provide AUTH_SECRET or the process refuses to serve.
 * Development falls back to a per-boot random secret (sessions reset on restart — acceptable in dev).
 */
let cachedSecret: Buffer | null = null
export function getAuthSecret(): Buffer {
  if (cachedSecret) return cachedSecret
  const raw = process.env.AUTH_SECRET
  if (!raw || raw.trim().length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'AUTH_SECRET is missing or too weak (min 16 chars). Set it before running in production: AUTH_SECRET=$(openssl rand -base64 32)'
      )
    }
    cachedSecret = randomBytes(32)
    return cachedSecret
  }
  cachedSecret = Buffer.from(raw, 'utf8')
  return cachedSecret
}

/** @internal test hook — clears the cached secret so env changes are re-read. */
export function _resetAuthSecretForTest() {
  cachedSecret = null
}

/** @internal test hook — craft a validly-signed token with an arbitrary expiry. */
export function _createTokenWithExpForTest(userId: string, exp: number, tokenVersion = 0): string {
  const payload: TokenPayload = { uid: userId, ver: tokenVersion, exp }
  const body = b64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

// ---------- Password hashing (scrypt, no external deps) ----------
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const candidate = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    if (candidate.length !== expected.length) return false
    return timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

// ---------- Token (HMAC-signed compact token) ----------
interface TokenPayload { uid: string; exp: number; ver?: number }

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(data: string): string {
  return createHmac('sha256', getAuthSecret()).update(data).digest('base64url')
}

export function createToken(userId: string, tokenVersion = 0): string {
  const payload: TokenPayload = {
    uid: userId,
    ver: tokenVersion,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE,
  }
  const body = b64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

function verifyToken(token: string): TokenPayload | null {
  try {
    const [body, sig] = token.split('.')
    if (!body || !sig) return null
    const expected = Buffer.from(sign(body), 'base64url')
    const actual = Buffer.from(sig, 'base64url')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload
    if (!payload.uid || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

// ---------- Cookie helpers ----------
export function sessionCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  }
}

export function clearedCookie() {
  return {
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  }
}

// ---------- Session resolution for route handlers ----------
export async function getSession(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = verifyToken(token)
  if (!payload) return null
  const user = await db.user.findUnique({
    where: { id: payload.uid },
    select: { id: true, orgId: true, email: true, name: true, role: true, active: true, tokenVersion: true },
  })
  // Deactivated users, deleted users, and tokens issued before a password
  // change (tokenVersion bump) are all rejected here — server-side revocation.
  if (!user || !user.active) return null
  if ((user.tokenVersion ?? 0) !== (payload.ver ?? 0)) return null
  return {
    id: user.id,
    orgId: user.orgId,
    email: user.email,
    name: user.name,
    role: (user.role as SessionUser['role']) || 'CASHIER',
  }
}

export function isStaff(session: SessionUser | null): boolean {
  return !!session && (session.role === 'ADMIN' || session.role === 'MANAGER')
}

export function isAdmin(session: SessionUser | null): boolean {
  return !!session && session.role === 'ADMIN'
}
