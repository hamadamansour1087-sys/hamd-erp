'use client'

/**
 * Offline mutation queue + tiny persist layer.
 * Mutations made while offline are stored locally and replayed (FIFO) on reconnect.
 */

export interface QueueItem {
  id: string
  url: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  at: number
}

const LS_KEY = 'tijara-mq'

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

export function enqueue(item: Omit<QueueItem, 'id' | 'at'>) {
  const items = read()
  items.push({ ...item, id: Math.random().toString(36).slice(2), at: Date.now() })
  write(items)
  notify()
}

/** Replay queued mutations sequentially. Returns number successfully synced. */
export async function flushQueue(): Promise<{ ok: number; failed: boolean }> {
  const items = read()
  if (items.length === 0) return { ok: 0, failed: false }
  let ok = 0
  const remaining: QueueItem[] = [...items]
  while (remaining.length > 0) {
    const item = remaining[0]
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: item.body !== undefined ? JSON.stringify(item.body) : undefined,
      })
      if (res.ok || res.status === 400 || res.status === 404) {
        // 4xx means server rejected permanently → drop item to avoid poison queue
        remaining.shift()
        write(remaining)
        if (res.ok) ok++
        notify()
      } else {
        // temporary server issue → stop and retry later
        return { ok, failed: true }
      }
    } catch {
      // still offline / flaky → stop
      return { ok, failed: false }
    }
  }
  return { ok, failed: false }
}

// ---------- Cached GET helpers ----------

export function cacheGet<T>(url: string): T | null {
  try {
    const raw = localStorage.getItem(`tijara-get:${url}`)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function cacheSet(url: string, data: unknown) {
  try {
    localStorage.setItem(`tijara-get:${url}`, JSON.stringify(data))
  } catch {}
}
