import { NextResponse } from 'next/server'
import type { SessionUser } from '@/lib/types'
import { isAdmin, isStaff } from '@/lib/auth'

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init)
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function unauthorized() {
  return bad('unauthorized', 401)
}

export function forbidden() {
  return bad('forbidden', 403)
}

export async function requireSession(
  getFn: () => Promise<SessionUser | null>
): Promise<SessionUser | Response> {
  const s = await getFn()
  if (!s) return unauthorized()
  return s
}

export function requireManager(session: SessionUser): SessionUser | Response {
  if (!isStaff(session)) return forbidden()
  return session
}

export function requireAdminRole(session: SessionUser): SessionUser | Response {
  if (!isAdmin(session)) return forbidden()
  return session
}

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : fallback
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function optStr(v: unknown): string | null {
  const s = str(v)
  return s.length > 0 ? s : null
}

export function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

/** Reserve the next document number inside an active transaction client. */
export async function nextNumber(tx: { counter: any }, orgId: string, docKey: string): Promise<number> {
  const c = await tx.counter.upsert({
    where: { orgId_docKey: { orgId, docKey } },
    create: { orgId, docKey, next: 2 },
    update: { next: { increment: 1 } },
  })
  return c.next - 1 === 0 ? 1 : c.next - 1
}
