'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cacheGet, cacheSet, enqueue } from '@/lib/offline/queue'
import { loadPosSnapshot, savePosSnapshot } from '@/lib/offline/pos-store'

/** The bootstrap payload is the POS offline dataset → mirrored into IndexedDB. */
function isPosSnapshotUrl(url: string): boolean {
  return url === '/api/bootstrap'
}

export interface ApiState<T> {
  data: T | undefined
  error: string | undefined
  loading: boolean
  fromCache: boolean
  refetch: () => void
}

export class ApiError extends Error {
  queued: boolean
  constructor(message: string, queued = false) {
    super(message)
    this.queued = queued
  }
}

export async function requestJson<T>(
  url: string,
  init?: RequestInit & { skipQueue?: boolean }
): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: init?.body ? { 'Content-Type': 'application/json', ...(init?.headers || {}) } : init?.headers,
    })
  } catch {
    // Network failure → queue writable mutations for later sync
  const method = ((init?.method as 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'GET') || 'GET')
  if (method !== 'GET' && !init?.skipQueue && typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueue({ url, method: method as 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: init?.body ? safeParse(init.body) : undefined })
    throw new ApiError('offline-queued', true)
  }
    // GET fallback to cache
    if (method === 'GET') {
      const cached = cacheGet<T>(url)
      if (cached !== null) return cached
    }
    throw new ApiError('network')
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(json.error || `http-${res.status}`)
  }
  return json.data as T
}

function safeParse(body: unknown) {
  try {
    return typeof body === 'string' ? JSON.parse(body) : body
  } catch {
    return undefined
  }
}

export async function apiGet<T>(url: string): Promise<T> {
  return requestJson<T>(url, { method: 'GET' })
}

export function useApi<T>(url: string | null): ApiState<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState<boolean>(!!url)
  const [fromCache, setFromCache] = useState(false)
  const [tick, setTick] = useState(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    // Defer to a microtask: state updates must not run synchronously inside the effect body
    void Promise.resolve().then(async () => {
      if (!url) {
        if (alive) {
          setData(undefined)
          setLoading(false)
          setFromCache(false)
          setError(undefined)
        }
        return
      }
      if (alive) setLoading(true)
      try {
        const d = await apiGet<T>(url)
        if (!alive) return
        cacheSet(url, d)
        if (isPosSnapshotUrl(url)) void savePosSnapshot(d)
        setData(d)
        setFromCache(false)
        setError(undefined)
      } catch (e) {
        if (!alive) return
        const err = e as ApiError
        const cached = cacheGet<T>(url)
        if (cached !== null) {
          setData(cached)
          setFromCache(true)
          setError(undefined)
        } else if (isPosSnapshotUrl(url)) {
          // localStorage evicted (quota/privacy purge) → IndexedDB snapshot.
          const idb = await loadPosSnapshot()
          if (!alive) return
          if (idb !== null) {
            setData(idb as T)
            setFromCache(true)
            setError(undefined)
          } else {
            setError(err.message)
          }
        } else {
          setError(err.message)
        }
      } finally {
        if (alive) setLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [url, tick])

  const refetch = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, fromCache, refetch }
}
