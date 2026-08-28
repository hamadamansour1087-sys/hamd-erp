import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/types'
import { isAdmin, isStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { createHash } from 'node:crypto'

/**
 * Thrown INSIDE a stock transaction when an atomic negative-stock guard
 * (conditional `updateMany` with `qty: { gte }` in the WHERE) matched 0 rows.
 * The route catches it OUTSIDE the transaction (whose partial writes were
 * rolled back) and maps it to 409 — the client can retry once stock arrives.
 */
export class InsufficientStockError extends Error {
  constructor(message = 'insufficient-stock') {
    super(message)
    this.name = 'InsufficientStockError'
  }
}

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

/** Signed money value clamped to [-MAX_MONEY, MAX_MONEY] — for balances that may legitimately be negative. */
export function signedMoney(v: unknown, fallback = 0): number {
  const n = num(v, fallback)
  return Math.min(MAX_MONEY, Math.max(-MAX_MONEY, n))
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
//
// IP resolution (clientIp): client-controlled X-Forwarded-For is NEVER trusted
// directly — an attacker could rotate the header every request to get a fresh
// bucket. Behind a trusted reverse proxy (nginx/caddy configured per DEPLOY.md
// to set/overwrite X-Real-IP and append the real client to X-Forwarded-For)
// set TRUST_PROXY=true to enable per-IP buckets. Without it, every request
// falls into one conservative shared bucket — impossible to bypass via
// headers (at the cost of users behind a shared NAT sharing the quota).

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

/**
 * Resolve the client IP for rate limiting.
 * - TRUST_PROXY=true  → use X-Real-IP (overwritten by the proxy) or the
 *   RIGHT-MOST X-Forwarded-For entry (appended by our own proxy, so it cannot
 *   be spoofed by the client). Safe behind nginx/caddy per DEPLOY.md.
 * - otherwise         → return a constant bucket key ('untrusted'). Client
 *   headers are ignored entirely, so rotating X-Forwarded-For per request
 *   cannot evade the limiter.
 */
export function clientIp(req: NextRequest): string {
  if (process.env.TRUST_PROXY === 'true') {
    const real = req.headers.get('x-real-ip')?.trim()
    if (real) return real
    const xff = req.headers.get('x-forwarded-for')
    if (xff) {
      const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
      if (parts.length > 0) return parts[parts.length - 1]
    }
  }
  return 'untrusted'
}

// ─────────────────────────── idempotency guard ───────────────────────────
// Offline POS replays can duplicate mutations (request committed, response lost).
// The client sends a stable `Idempotency-Key` header per logical operation; the
// first successful execution records its resultId, and replays receive the same
// document instead of creating a second one.
//
// KEY IDENTITY (canonicalization-safe):
//   The RAW header value is never mutated and never used as identity directly.
//   It is VALIDATED strictly (charset [A-Za-z0-9._:-], length 6–100) — any
//   other character is a 400 before any DB touch — and the stored/stable
//   identity is `scope:SHA-256(rawKey)`. Two different raw keys therefore can
//   never alias to one operation (the old regex-cleaning made `abc@123` and
//   `abc123` collide, and all-symbol keys collapsed to '').
//
// CRASH-WINDOW SAFETY (two layers):
//   Layer 1 — the IdempotencyKey CLAIM row (fast path, pre-transaction).
//   Layer 2 — the FINANCIAL DOCUMENT itself: handlers embed the scoped key as
//   `clientOperationId` (unique per org) inside the same transaction that writes
//   the document. If the server crashes between the financial COMMIT and the
//   resultId bookkeeping, the retry re-runs the handler; the document-level
//   @@unique violation resolves to the already-committed document — a duplicate
//   financial document is impossible in every interleaving.

/** Strict Idempotency-Key charset: letters, digits, dot, underscore, colon, dash. */
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{6,100}$/

/**
 * Stable operation identity for a raw client key: `scope:SHA-256(rawKey)`.
 * Shared by withIdempotency() and the regression tests so both agree on the
 * stored IdempotencyKey.key / document clientOperationId values.
 */
export function clientOperationIdFor(scope: string, rawKey: string): string {
  return `${scope}:${createHash('sha256').update(rawKey).digest('hex')}`
}

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
 * Detect a Prisma unique-constraint violation (optionally on a specific field).
 * Works for errors thrown inside or outside $transaction callbacks.
 */
export function isUniqueViolation(e: unknown, field?: string): boolean {
  const err = e as { code?: unknown; meta?: { target?: unknown } }
  if (err?.code !== 'P2002') return false
  if (!field) return true
  const target = err.meta?.target
  if (Array.isArray(target)) return target.some((t) => String(t).includes(field))
  return String(target ?? '').includes(field)
}

/**
 * Run `run()` once per (org, key). `run` receives the scoped clientOperationId
 * (or null when no valid key was provided) and MUST, for financial operations,
 * write it into the document's `clientOperationId` column inside the creation
 * transaction — see the crash-window notes above.
 *
 * Returns `{ reused: true, value }` when the key was claimed before (replay or
 * crash recovery). If the first attempt throws, the claim is released so the
 * operation can be retried with the same key.
 */
export async function withIdempotency<T>(
  req: NextRequest,
  session: SessionUser,
  scope: string,
  run: (clientOperationId: string | null) => Promise<T>
): Promise<IdempotentResult<T> | Response> {
  const rawKey = req.headers.get('idempotency-key')?.trim()
  if (!rawKey) {
    // No key → legacy non-idempotent behavior (kept for compatibility)
    const value = await run(null)
    return { reused: false, value }
  }
  // An INVALID key must never execute the operation (and never silently
  // degrade to non-idempotent): reject with 400 before any DB touch.
  if (!IDEMPOTENCY_KEY_RE.test(rawKey)) return bad('invalid-idempotency-key', 400)
  // Identity = hash of the raw key — different raw keys can never collide.
  const clientOpId = clientOperationIdFor(scope, rawKey)

  let claim
  try {
    claim = await db.idempotencyKey.create({
      data: { orgId: session.orgId, userId: session.id, key: clientOpId },
    })
  } catch {
    // Unique (orgId, key) violated → this operation was claimed before.
    const existing = await db.idempotencyKey.findUnique({
      where: { orgId_key: { orgId: session.orgId, key: clientOpId } },
      select: { resultId: true, userId: true },
    })
    // SECURITY: a replayed key is only honoured by its ORIGINAL OWNER. Another
    // user in the same org must never receive another user's operation result.
    if (existing && existing.userId !== session.id) {
      return bad('duplicate-key-owner', 403)
    }
    if (existing?.resultId) {
      return { reused: true, value: { id: existing.resultId } as T }
    }
    // Claim exists WITHOUT a result → the original attempt is either still in
    // flight or it crashed after the financial COMMIT but before the resultId
    // was recorded. Re-run the handler: the document-level @@unique on
    // clientOperationId resolves the ambiguity — an already-committed document
    // is returned as-is; a never-committed one is created exactly once.
    const value = await run(clientOpId)
    const resultId = extractId(value)
    if (resultId) {
      // Backfill the claim so future replays short-circuit (may already be gone).
      await db.idempotencyKey.updateMany({
        where: { orgId: session.orgId, key: clientOpId, resultId: null },
        data: { resultId },
      })
    }
    return { reused: true, value }
  }

  try {
    const value = await run(clientOpId)
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
