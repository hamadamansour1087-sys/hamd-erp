import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/types'
import { isAdmin, isStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'

/**
 * MONEY PRECISION BOUNDARY (docs/DATABASE-MIGRATION.md → PHASE 3).
 * The database stores every money column as DECIMAL(14,2) and quantities as
 * DECIMAL(14,3) — exact base-10, no float drift. Prisma returns those columns
 * as Decimal objects; the API contract must stay NUMERIC for the existing
 * frontend, so every response crosses this conversion layer exactly once:
 *
 *   DB DECIMAL  →  domain math (number, round2)  →  decToNum  →  JSON number
 *
 * Number(Decimal) is exact for all supported magnitudes (|x| ≤ 1e9, ≤ 3dp —
 * far below 2^53). Plain-JSON values (strings, booleans, dates, nulls, ids)
 * pass through untouched.
 */
export function decToNum<T>(value: T): T {
  if (value instanceof Prisma.Decimal) return Number(value) as T
  if (Array.isArray(value)) {
    const out = new Array(value.length)
    for (let i = 0; i < value.length; i++) out[i] = decToNum(value[i])
    return out as T
  }
  if (value instanceof Date) return value
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    let changed = false
    for (const k of Object.keys(src)) {
      const v = decToNum(src[k])
      if (v !== src[k]) changed = true
      out[k] = v
    }
    return (changed ? out : value) as T
  }
  return value
}

/**
 * Thrown when an operation is valid per-field but conflicts with concurrent
 * state (overpayment, paid-amount CAS exhaustion). Routes catch it OUTSIDE
 * withIdempotency (which releases the claim on rethrow) and map it to 409/400.
 */
export class OperationConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OperationConflictError'
  }
}

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
  return NextResponse.json({ data: decToNum(data) }, init)
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

/** Absolute sanity cap for any quantity (openings, invoice items, adjustments). */
export const MAX_QTY = 1_000_000_000

/**
 * Signed quantity value clamped to [-MAX_QTY, MAX_QTY] — rejects non-finite
 * input so absurd magnitudes (1e307) can never poison stock math downstream.
 */
export function qtyVal(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(MAX_QTY, Math.max(-MAX_QTY, n))
}

/** Round to the StockLevel/qty precision — DECIMAL(14,3). */
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000
}

/**
 * Parse a client-supplied date, rejecting values outside [2000-01-01, 2100-01-01].
 * Out-of-range/unparseable input returns null (caller decides: reject or default).
 * Prevents year-9999/1900 documents from poisoning period reports.
 */
export function safeDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  if (isNaN(d.getTime())) return null
  if (d.getTime() < Date.UTC(2000, 0, 1) || d.getTime() > Date.UTC(2100, 0, 1)) return null
  return d
}

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

/** Loose shape check for a v4/v6 IP — rejects junk header values so garbage
 *  keys cannot flood the limiter's bucket map. Not a full INET parser. */
const IP_SHAPE_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]{2,45}$/

/**
 * Resolve the client IP for rate limiting.
 * - TRUST_PROXY=true  → use X-Real-IP (overwritten by the proxy) or the
 *   RIGHT-MOST X-Forwarded-For entry (appended by our own proxy, so it cannot
 *   be spoofed by the client). Safe ONLY when the app is not directly
 *   reachable — behind nginx/caddy per DEPLOY.md.
 * - otherwise         → return a constant bucket key ('untrusted'). Client
 *   headers are ignored entirely, so rotating X-Forwarded-For per request
 *   cannot evade the limiter.
 * Header values are shape-validated and length-capped either way: a malformed
 * or oversized value falls back to the shared bucket instead of becoming an
 * attacker-controlled map key.
 */
export function clientIp(req: NextRequest): string {
  if (process.env.TRUST_PROXY === 'true') {
    const candidates = [
      req.headers.get('x-real-ip')?.trim(),
      (() => {
        const xff = req.headers.get('x-forwarded-for')
        if (!xff) return null
        const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
        return parts.length > 0 ? parts[parts.length - 1] : null
      })(),
    ]
    for (const c of candidates) {
      if (c && c.length <= 45 && IP_SHAPE_RE.test(c)) return c
    }
  }
  return 'untrusted'
}

// ─────────────────── login brute-force ledger (DB-backed) ───────────────────
// The in-memory rateLimit() above is only a cheap PRE-AUTH DoS damper. The
// actual brute-force control is this DB-backed, FAIL-ONLY ledger: one row per
// failed login attempt per account. Being in the database it is enforced
// globally — it survives restarts and holds across multiple app instances.
// Because successful logins are never recorded, an attacker spamming a
// victim's address with wrong passwords can never lock the victim out: the
// victim's correct-password attempt skips this path entirely.

const LOGIN_WINDOW_MS = 5 * 60_000
/** Max failed attempts per ACCOUNT per window (10th failure still 401, 11th → 429). */
export const LOGIN_ACCT_MAX = 10
/** Max failed attempts per IP per window (distributed brute-force damper). */
export const LOGIN_IP_MAX = 20
/** Ledger rows older than this are useless — purged opportunistically. */
const LOGIN_LEDGER_MAX_AGE_MS = 24 * 86_400_000
let loginLedgerGcCounter = 0

export interface LoginBudget {
  /** failures for this ACCOUNT are still under the cap */
  acct: boolean
  /** failures from this IP are still under the cap */
  ip: boolean
}

/**
 * Record a failed login (fail-only: successful logins are never recorded, so
 * neither an attacker nor a busy NAT office can ever lock a real user out)
 * and report whether the account AND the ip are still under their failure
 * caps. The counts include the row just written. Enforcement is DB-backed →
 * holds across restarts and multiple app instances.
 */
export async function recordFailedLogin(rawEmail: string, rawIp: string): Promise<LoginBudget> {
  // Bounded key values: a hostile pre-auth body must not be able to write
  // multi-KB strings into the ledger row.
  const email = rawEmail.slice(0, 200)
  const ip = rawIp.slice(0, 64)
  await db.loginAttempt.create({ data: { email, ip } }).catch(() => undefined)
  const since = new Date(Date.now() - LOGIN_WINDOW_MS)
  // TARGETED PURGE: rows older than the window for THIS email/ip can never
  // affect a budget decision again — deleting them on every failure keeps each
  // key's footprint bounded (the 24h full-table GC below is forensics only).
  void db.loginAttempt
    .deleteMany({
      where: {
        OR: [
          { email, createdAt: { lt: since } },
          { ip, createdAt: { lt: since } },
        ],
      },
    })
    .catch(() => undefined)
  if (++loginLedgerGcCounter % 5 === 0) {
    void db.loginAttempt
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - LOGIN_LEDGER_MAX_AGE_MS) } } })
      .catch(() => undefined)
  }
  const [acctFails, ipFails] = await Promise.all([
    db.loginAttempt.count({ where: { email, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { ip, createdAt: { gte: since } } }),
  ])
  return { acct: acctFails <= LOGIN_ACCT_MAX, ip: ipFails <= LOGIN_IP_MAX }
}

// ─────────────── DB-backed rate-limit ledger (multi-instance safe) ───────────────
// Sliding-window budget recorded in the database: one row per admitted hit
// under `key`. Unlike the in-memory rateLimit() damper (per-process, wiped by
// restarts), this budget is GLOBAL — it survives restarts and is enforced
// across multiple app instances; each instance's in-memory damper only trims
// its own traffic, the DB decides the real budget. Intended for pre-auth
// endpoints where the caller has no session/org yet (registration today).
// Fail-open ONLY if the ledger itself is unreachable — the request then
// continues and fails naturally on its next DB touch.
const RATE_LEDGER_MAX_AGE_MS = 24 * 86_400_000
let rateLedgerGcCounter = 0

export async function dbRateLimit(rawKey: string, max: number, windowMs: number): Promise<boolean> {
  // Bounded key value: a hostile pre-auth request must not be able to write
  // multi-KB strings into a ledger row.
  const key = rawKey.slice(0, 200)
  await db.rateLimitEvent.create({ data: { bucketKey: key } }).catch(() => undefined)
  const since = new Date(Date.now() - windowMs)
  // Targeted purge: expired rows for THIS key can never affect a decision
  // again — deleting them on every call keeps each key's footprint bounded.
  void db.rateLimitEvent
    .deleteMany({ where: { bucketKey: key, createdAt: { lt: since } } })
    .catch(() => undefined)
  if (++rateLedgerGcCounter % 10 === 0) {
    void db.rateLimitEvent
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RATE_LEDGER_MAX_AGE_MS) } } })
      .catch(() => undefined)
  }
  const hits = await db.rateLimitEvent
    .count({ where: { bucketKey: key, createdAt: { gte: since } } })
    .catch(() => 0)
  return hits <= max
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
 * Detect a Prisma foreign-key constraint violation (P2003) — used by delete
 * routes where a referencing row can land between the usage pre-check and the
 * delete (the FK is the source of truth; the route maps it to 409).
 */
export function isFkViolation(e: unknown): boolean {
  return (e as { code?: unknown })?.code === 'P2003'
}

/**
 * Detect a transient DB conflict worth retrying on a FRESH transaction:
 * PostgreSQL deadlock victim (40P01) and serialization/lock-conflict aborts
 * (40001 / Prisma P2034). These abort the whole transaction, so the caller
 * must re-run the handler (reads included) — see withDbRetry().
 */
export function isTransientDbConflict(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code
  if (code === 'P2034') return true
  const msg = String((e as Error)?.message ?? '')
  return (
    msg.includes('deadlock detected') ||
    msg.includes('40P01') ||
    msg.includes('40001') ||
    msg.includes('could not serialize')
  )
}

/**
 * Re-run a transaction-returning closure up to `tries` times when PostgreSQL
 * aborts it as a deadlock victim or serialization failure. Deterministic
 * validation errors pass through untouched on the first attempt.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      if (!isTransientDbConflict(e)) throw e
    }
  }
  throw lastError
}

/**
 * Body-size guard for route handlers (App Router imposes NO default limit).
 * Reads the body as a stream and ABORTS past `capBytes`, so an oversized or
 * chunked payload can never be fully buffered into memory (pre-auth DoS).
 * Returns {} for oversize/unparseable bodies — route validation then answers
 * 400 missing-fields without any 500 path.
 */
export async function readJson(req: NextRequest, capBytes = 1_000_000): Promise<Record<string, unknown>> {
  const cl = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(cl) && cl > capBytes) return {}
  const stream = (req.body as ReadableStream<Uint8Array> | null) ?? null
  if (!stream || typeof stream.getReader !== 'function') {
    // Non-stream environment (tests / polyfills): read whole body, cap AFTER.
    try {
      const text = await req.text()
      if (text.length > capBytes) return {}
      const parsed = JSON.parse(text)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > capBytes) {
      try { await reader.cancel() } catch {}
      return {}
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.length
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(merged))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
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

// Opportunistic GC for the claim table: every Nth keyed call, purge claims
// older than 90 days. Without this the table grows unboundedly (one row per
// keyed mutation, forever). Deleting an unresolved claim is crash-safe — a
// late retry re-runs the handler and the document-level @@unique dedupes.
const CLAIM_GC_INTERVAL = 200
const CLAIM_MAX_AGE_MS = 90 * 86_400_000
let claimGcCounter = 0

function maybeGcClaims() {
  claimGcCounter++
  if (claimGcCounter % CLAIM_GC_INTERVAL !== 0) return
  void db.idempotencyKey
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - CLAIM_MAX_AGE_MS) } } })
    .catch(() => undefined)
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
  maybeGcClaims()

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
