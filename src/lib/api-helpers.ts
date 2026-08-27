import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/types'
import { isAdmin, isStaff } from '@/lib/auth'
import { db } from '@/lib/db'

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

export function tooMany() {
  return bad('too-many-requests', 429)
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

// ─────────────────────────── validation primitives ───────────────────────────

/** Absolute sanity cap for any money amount (protects against 1e308-style abuse). */
export const MAX_MONEY = 1_000_000_000

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : fallback
}

/** Finite money value clamped to [0, MAX_MONEY] — use for amounts entered by users. */
export function money(v: unknown, fallback = 0): number {
  const n = num(v, fallback)
  return Math.min(MAX_MONEY, Math.max(0, n))
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** Bounded string — trims and hard-caps length to protect the DB from dumps. */
export function boundedStr(v: unknown, maxLen: number): string {
  return str(v).slice(0, maxLen)
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

// ─────────────────────────── rate limiting (in-memory) ───────────────────────────
// Single-instance sliding window. For multi-instance deployments back this with Redis.

interface Bucket {
  hits: number[]
}
const buckets = new Map<string, Bucket>()

/** Allow at most `limit` requests per `windowMs` for the given key. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key) ?? { hits: [] }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs)
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket)
    return false
  }
  bucket.hits.push(now)
  buckets.set(key, bucket)
  // opportunistic cleanup so the map cannot grow unbounded
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) {
      if (b.hits.every((t) => now - t >= windowMs)) buckets.delete(k)
    }
  }
  return true
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local'
  )
}

// ─────────────────────────── idempotency guard ───────────────────────────
// Offline POS replays can duplicate mutations (request committed, response lost).
// The client sends a stable `Idempotency-Key` header per logical operation; the
// first successful execution records its resultId, and replays receive the same
// document instead of creating a second one.

export interface IdempotentResult<T> {
  reused: boolean
  value: T
}

/** Extract a stable result id from an arbitrary handler value, if any. */
function extractId(value: unknown): string | null {
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

/**
 * Run `run()` once per (org, key). Returns `{ reused: true, value }` carrying the
 * original resultId when the same key is replayed. If `run()` throws, the claim is
 * released so the operation can be retried.
 *
 * Handlers should return an object containing an `id` (the created document); for
 * id-less operations (e.g. stock adjust) embed a synthetic id so replays resolve.
 */
export async function withIdempotency<T>(
  req: NextRequest,
  session: SessionUser,
  scope: string,
  run: () => Promise<T>
): Promise<IdempotentResult<T> | Response> {
  const rawKey = req.headers.get('idempotency-key')?.trim()
  if (!rawKey || rawKey.length < 6 || rawKey.length > 100) {
    // No/invalid key → legacy non-idempotent behavior (kept for compatibility)
    const value = await run()
    return { reused: false, value }
  }
  const key = `${scope}:${rawKey.replace(/[^\w.:-]/g, '')}`

  let claim
  try {
    claim = await db.idempotencyKey.create({
      data: { orgId: session.orgId, userId: session.id, key },
    })
  } catch {
    // Unique (orgId, key) violated → this operation was already processed.
    const existing = await db.idempotencyKey.findUnique({
      where: { orgId_key: { orgId: session.orgId, key } },
      select: { resultId: true },
    })
    if (existing?.resultId) {
      return { reused: true, value: { id: existing.resultId } as T }
    }
    // Claim exists without a result → original attempt still in flight or crashed;
    // release stale claim (older than 2 min) or ask client to retry.
    const stale = await db.idempotencyKey.findUnique({
      where: { orgId_key: { orgId: session.orgId, key } },
      select: { createdAt: true },
    })
    if (stale && Date.now() - stale.createdAt.getTime() > 120_000) {
      await db.idempotencyKey.deleteMany({ where: { orgId: session.orgId, key, resultId: null } })
    }
    return bad('duplicate-in-progress', 409)
  }

  try {
    const value = await run()
    const resultId = extractId(value)
    if (resultId) {
      await db.idempotencyKey.update({ where: { id: claim.id }, data: { resultId } })
    }
    return { reused: false, value }
  } catch (e) {
    // Release the claim so a corrected retry can proceed.
    await db.idempotencyKey.delete({ where: { id: claim.id } }).catch(() => undefined)
    throw e
  }
}

/** Serialize a withIdempotency() result into the normal `ok()` envelope. */
export function okIdempotent<T>(
  res: IdempotentResult<T> | Response,
  extra?: (value: T) => Record<string, unknown>
) {
  if (res instanceof Response) return res
  return ok({ ...(res.value as object), duplicate: res.reused, ...(extra ? extra(res.value) : {}) })
}
