/**
 * Offline queue hardening regression suite (bun:test, no DB required).
 *
 * Covers the 2025-09 audit fixes:
 *  - OFF-Q1  enqueue() preserves the caller-supplied id — the SAME key that
 *            travelled with the online request must be reused on replay, or a
 *            committed-but-response-lost mutation is double-booked.
 *  - OFF-Q2  enqueue()/write() report storage failure (quota) instead of
 *            silently swallowing it (fake "saved offline" + lost sale).
 *  - OFF-Q3  flushQueue() sends the item id as the Idempotency-Key header.
 *  - OFF-Q4  flushQueue() rotates 409-conflicting items to the back instead of
 *            head-of-line blocking every later item forever (items kept).
 *  - OFF-Q5  flushQueue() stops when EVERY remaining item is conflicting.
 *  - OFF-Q6  items of another identity are held, never replayed.
 *  - OFF-Q7  401 keeps items + raises the session gate; resetSessionExpiry
 *            re-arms replay (existing behavior, now locked by a test).
 *
 * Run: bun test tests/security/offline-queue.test.ts
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

// ── localStorage shim (the queue module is storage-backed) ──────────────────
const store = new Map<string, string>()
const realSetItem = (k: string, v: string) => {
  store.set(k, String(v))
}
const localStorageShim = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: realSetItem,
  removeItem: (k: string) => {
    store.delete(k)
  },
  get length() {
    return store.size
  },
  key: (i: number) => Array.from(store.keys())[i] ?? null,
}
;(globalThis as Record<string, unknown>).localStorage = localStorageShim

import {
  enqueue,
  flushQueue,
  resetSessionExpiry,
  type QueueItem,
} from '../../src/lib/offline/queue'

/** Test-only reader — the queue lives under the well-known 'tijara-mq' key. */
function readQueueForTest(): QueueItem[] {
  const raw = store.get('tijara-mq')
  return raw ? (JSON.parse(raw) as QueueItem[]) : []
}

const ME = { orgId: 'org-a', userId: 'user-1' }
function seedIdentity() {
  store.set(
    'tijara-boot-cache',
    JSON.stringify({ user: { id: ME.userId, orgId: ME.orgId } })
  )
}

beforeEach(() => {
  store.clear()
  seedIdentity()
  resetSessionExpiry()
})

afterEach(() => {
  ;(globalThis as Record<string, unknown>).fetch = undefined
})

function installFetch(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  ;(globalThis as Record<string, unknown>).fetch = (async (url: any, init?: any) =>
    handler(String(url), init)) as unknown as typeof fetch
}

describe('offline queue hardening', () => {
  test('OFF-Q1: enqueue preserves the caller-supplied id (stable idempotency key)', () => {
    const saved = enqueue({ url: '/api/invoices', method: 'POST', body: { x: 1 }, id: 'abc-123' })
    expect(saved).toBe(true)
    const q = readQueueForTest()
    expect(q).toHaveLength(1)
    expect(q[0].id).toBe('abc-123')
  })

  test('OFF-Q2: enqueue returns false when localStorage quota is exhausted', () => {
    const shim = globalThis.localStorage as unknown as { setItem: (k: string, v: string) => void }
    shim.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    const saved = enqueue({ url: '/api/invoices', method: 'POST', body: {} })
    expect(saved).toBe(false)
    shim.setItem = realSetItem
  })

  test('OFF-Q3: flushQueue sends the item id as Idempotency-Key and drops on 2xx', async () => {
    enqueue({ url: '/api/invoices', method: 'POST', body: { total: 10 }, id: 'op-key-9' })
    let seenKey: string | null = null
    installFetch((_url, init) => {
      seenKey = (init?.headers as Record<string, string>)['Idempotency-Key'] ?? null
      return new Response(JSON.stringify({ data: { id: 'inv-1' } }), { status: 200 })
    })
    const res = await flushQueue()
    expect(seenKey).toBe('op-key-9')
    expect(res.ok).toBe(1)
    expect(readQueueForTest()).toHaveLength(0)
  })

  test('OFF-Q4: a 409 item is rotated to the back — later items still sync, item kept', async () => {
    enqueue({ url: '/api/invoices', method: 'POST', body: { n: 1 }, id: 'conflict-1' })
    enqueue({ url: '/api/expenses', method: 'POST', body: { n: 2 }, id: 'fine-2' })
    let calls = 0
    installFetch(() => {
      calls++
      if (calls === 1 || calls === 3) return new Response('conflict', { status: 409 })
      return new Response('{}', { status: 200 })
    })
    const res = await flushQueue()
    expect(res.ok).toBe(1) // the fine item synced
    const q = readQueueForTest()
    expect(q).toHaveLength(1) // the 409 item is KEPT, not dropped
    expect(q[0].id).toBe('conflict-1')
    expect((q[0].attempts ?? 0)).toBeGreaterThanOrEqual(1)
  })

  test('OFF-Q5: flush stops (failed) when every remaining item is conflicting', async () => {
    enqueue({ url: '/api/invoices', method: 'POST', body: {}, id: 'c1' })
    enqueue({ url: '/api/invoices', method: 'POST', body: {}, id: 'c2' })
    installFetch(() => new Response('conflict', { status: 409 }))
    const res = await flushQueue()
    expect(res.failed).toBe(true)
    expect(res.ok).toBe(0)
    const q = readQueueForTest()
    expect(q).toHaveLength(2)
    expect(q.every((i) => (i.attempts ?? 0) === 1)).toBe(true)
  })

  test('OFF-Q6: items of another identity are held, never replayed', async () => {
    store.set(
      'tijara-mq',
      JSON.stringify([
        { id: 'foreign', url: '/api/invoices', method: 'POST', body: {}, at: 1, orgId: 'org-b', userId: 'user-9' },
      ])
    )
    let calls = 0
    installFetch(() => {
      calls++
      return new Response('{}', { status: 200 })
    })
    const res = await flushQueue()
    expect(calls).toBe(0)
    expect(res.held).toBe(1)
    expect(readQueueForTest()).toHaveLength(1)
  })

  test('OFF-Q7: 401 keeps items, gates replay; resetSessionExpiry re-arms', async () => {
    enqueue({ url: '/api/invoices', method: 'POST', body: {}, id: 'keep-1' })
    installFetch(() => new Response('unauthorized', { status: 401 }))
    const res = await flushQueue()
    expect(res.sessionExpired).toBe(true)
    expect(readQueueForTest()).toHaveLength(1)
    // gated: nothing is sent even with a healthy server
    let calls = 0
    installFetch(() => {
      calls++
      return new Response('{}', { status: 200 })
    })
    const gated = await flushQueue()
    expect(calls).toBe(0)
    expect(gated.sessionExpired).toBe(true)
    // re-login re-arms
    resetSessionExpiry()
    const back = await flushQueue()
    expect(calls).toBe(1)
    expect(back.ok).toBe(1)
  })
})
