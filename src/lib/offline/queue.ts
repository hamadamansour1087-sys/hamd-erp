'use client'

/**
 * Offline mutation queue + tiny persist layer.
 * Mutations made while offline are stored locally and replayed (FIFO) on reconnect.
 *
 * Security/integrity rules:
 *  - Every item is stamped with the (orgId, userId) that created it.
 *  - Items are ONLY replayed under the same identity — a queued operation can
 *    never be executed under a different user/tenant (no cross-tenant injection).
 *  - Replay sends a stable `Idempotency-Key` (= item id) so a server-side commit
 *    whose response was lost is never applied twice.
 *  - Cached GET responses are namespaced per identity; `clearGetCache()` purges
 *    them on logout / account switch so tenant data never leaks across accounts.
 *
 * NOTE: this module intentionally has NO imports from stores — the current
 * identity is read from the persisted boot cache, keeping the module graph
 * cycle-free (a session↔queue cycle breaks module evaluation under Turbopack).
 */

export interface QueueItem {
  id: string
  url: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  at: number
  orgId?: string
  userId?: string
}

const LS_KEY = 'tijara-mq'
const BOOT_CACHE_KEY = 'tijara-boot-cache'

/**
 * Session-expiry gate: once the server answers 401 during a replay, the queued
 * items can NEVER sync under the current cookie — retrying them every poll is
 * guaranteed to fail (reproduced live 2026-08-30 after an AUTH_SECRET rotation).
 * The gate stops network replays until the user signs in again; re-login calls
 * resetSessionExpiry() (from the session store) so the next flush runs normally.
 * Items are KEPT while gated — a disabled-then-reactivated account, or the same
 * user signing back in, still gets every offline sale delivered exactly once.
 */
let sessionGate = false

/** Clear the 401 gate — called on successful (re)login. */
export function resetSessionExpiry() {
  sessionGate = false
}

/** Current signed-in identity, read from the persisted bootstrap cache. */
function currentIdentity(): { orgId: string; userId: string } | null {
  try {
    const raw = localStorage.getItem(BOOT_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { user?: { id?: string; orgId?: string } | null }
    const u = parsed.user
    if (!u?.id || !u?.orgId) return null
    return { orgId: u.orgId, userId: u.id }
  } catch {
    return null
  }
}

function read(): QueueItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as QueueItem[]) : []
  } catch {
    return []
  }
}

function write(items: QueueItem[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items))
  } catch {}
}

let listeners: Array<(n: number) => void> = []

export function onQueueChange(fn: (n: number) => void) {
  listeners.push(fn)
  fn(read().length)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}

export function queueSize(): number {
  return read().length
}

function notify() {
  const n = read().length
  listeners.forEach((l) => l(n))
}

export function enqueue(item: Omit<QueueItem, 'id' | 'at' | 'orgId' | 'userId'>) {
  const items = read()
  const identity = currentIdentity()
  items.push({
    ...item,
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    at: Date.now(),
    orgId: identity?.orgId,
    userId: identity?.userId,
  })
  write(items)
  notify()
}

/**
 * Replay queued mutations sequentially.
 * Items belonging to another user/tenant are HELD (never replayed here).
 */
export interface FlushResult {
  ok: number
  failed: boolean
  held: number
  /** 401 mid-replay → session ended; caller must surface re-login. */
  sessionExpired?: boolean
  /** 403 mid-replay → identity can never send this item; it was dropped. */
  rejected?: number
}

export async function flushQueue(): Promise<FlushResult> {
  const all = read()
  if (all.length === 0) return { ok: 0, failed: false, held: 0 }
  if (sessionGate) return { ok: 0, failed: false, held: all.length, sessionExpired: true }

  const identity = currentIdentity()
  if (!identity) return { ok: 0, failed: false, held: all.length }

  const heldItems = all.filter((i) => i.orgId !== identity.orgId || i.userId !== identity.userId)
  const replayable = all.filter((i) => i.orgId === identity.orgId && i.userId === identity.userId)
  const held = heldItems.length
  if (replayable.length === 0) return { ok: 0, failed: false, held }

  const persist = (queue: QueueItem[]) => write([...queue, ...heldItems])

  let ok = 0
  let rejected = 0
  const queue = [...replayable]
  while (queue.length > 0) {
    const item = queue[0]
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': item.id,
        },
        credentials: 'include',
        body: item.body !== undefined ? JSON.stringify(item.body) : undefined,
      })
      if (res.status === 401) {
        // Session ended (expired / secret rotated / user deactivated). Nothing
        // more can sync under this cookie — stop, KEEP every item, gate future
        // replays, and let the caller surface re-login. Never drop financial
        // data on 401: after re-login as the SAME user the replay continues.
        persist(queue)
        sessionGate = true
        return { ok, failed: false, held, sessionExpired: true }
      }
      if (res.ok || res.status === 400 || res.status === 404 || res.status === 403) {
        // 4xx means server rejected permanently → drop item to avoid poison queue.
        // 403 (permission bound to this identity) can never succeed on replay,
        // so it joins the permanent-reject drop list — counted, not silent.
        queue.shift()
        persist(queue)
        if (res.ok) ok++
        else rejected++
        notify()
      } else {
        // temporary server issue / still processing (409) → stop and retry later
        persist(queue)
        return { ok, failed: true, held, rejected }
      }
    } catch {
      // still offline / flaky → stop
      persist(queue)
      return { ok, failed: false, held, rejected }
    }
  }
  return { ok, failed: false, held, rejected }
}

// ---------- Cached GET helpers (namespaced per identity) ----------

function cacheKey(url: string): string {
  const id = currentIdentity()
  return `tijara-get:${id?.orgId ?? 'anon'}:${id?.userId ?? 'anon'}:${url}`
}

export function cacheGet<T>(url: string): T | null {
  try {
    const raw = localStorage.getItem(cacheKey(url))
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function cacheSet(url: string, data: unknown) {
  try {
    localStorage.setItem(cacheKey(url), JSON.stringify(data))
  } catch {}
}

export { clearGetCache } from './cache-purge'
