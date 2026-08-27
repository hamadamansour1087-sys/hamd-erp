import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import type { SessionUser } from '@/lib/types'

const SECRET = process.env.AUTH_SECRET || 'sahlx-dev-secret-change-me'
const COOKIE_NAME = 'session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

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

// ---------- Token (JWT-like HS256 compact) ----------
interface TokenPayload { uid: string; exp: number }

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(data: string): string {
  return createHmac('sha256', SECRET).update(data).digest('base64url')
}

export function createToken(userId: string): string {
  const payload: TokenPayload = { uid: userId, exp: Math.floor(Date.now() / 1000) + MAX_AGE }
  const body = b64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

function verifyToken(token: string): TokenPayload | null {
  try {
    const [body, sig] = token.split('.')
    if (!body || !sig) return null
    if (sign(body) !== sig) return null
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
    path: '/',
    maxAge: MAX_AGE,
  }
}

export function clearedCookie() {
  return { name: COOKIE_NAME, value: '', httpOnly: true, path: '/', maxAge: 0 }
}

// ---------- Session resolution for route handlers ----------
export async function getSession(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = verifyToken(token)
  if (!payload) return null
  const user = await db.user.findUnique({
    where: { id: payload.uid },
    select: { id: true, orgId: true, email: true, name: true, role: true, active: true },
  })
  if (!user || !user.active) return null
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
