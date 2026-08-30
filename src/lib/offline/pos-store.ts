'use client'

/**
 * IndexedDB offline store for the POS "big data" (product/customer snapshot).
 *
 * WHY: localStorage held the whole /api/bootstrap snapshot (products +
 * customers + warehouses + org settings). That payload grows with the catalog
 * (tens/hundreds of KB) and localStorage is synchronous + string-only + capped
 * (~5MB shared with the mutation queue and every other key). IndexedDB is the
 * correct home for structured offline data — async, binary-tolerant, far
 * larger quota, evictable only under storage pressure.
 *
 * WHAT GOES WHERE (single source of truth for the offline split):
 *  - IndexedDB (this file): bootstrap snapshots (products, barcodes, prices,
 *    stock snapshot, customers, org/POS + tax settings). Data-blob territory.
 *  - localStorage: tiny keys only — cart (tijara-cart), boot identity
 *    (tijara-boot-cache: id/name/role/org — NO secrets, NO password hashes,
 *    NO session tokens — the auth cookie never touches JS), mutation queue
 *    (tijara-mq: small JSON ops), tiny GET caches (small lists).
 *  - Service Worker Cache API: app shell + build assets + raw GET responses.
 *
 * SECURITY: only /api/bootstrap payloads are stored here — the same data the
 * cashier UI already renders. Nothing credential-shaped is ever persisted
 * client-side (see docs/FINAL-REPORT.md — session = httpOnly cookie).
 *
 * FALLBACK: when IndexedDB is unavailable (SSR, private-mode edge cases) every
 * function resolves to null — callers fall back to the localStorage cache in
 * hooks/use-api.ts, so behavior degrades to the pre-existing path.
 */

const DB_NAME = 'hamd-offline'
const DB_VERSION = 1
const STORE = 'kv'

/** Open the DB once per page; subsequent calls reuse the connection. */
let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null)
  }
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      req.onsuccess = () => {
        const db = req.result
        // A later-version delete (e.g. storage wipe) must not leave a dead handle.
        db.onversionchange = () => db.close()
        resolve(db)
      }
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function txGet(db: IDBDatabase, key: string): Promise<unknown | undefined> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

function txPut(db: IDBDatabase, key: string, value: unknown): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

export interface PosSnapshotEnvelope {
  /** `orgId:userId` — snapshots are namespaced per identity, same rule as the LS GET cache. */
  identity: string
  /** Fetch-time payload of /api/bootstrap (org, categories, warehouses, products, customers). */
  data: unknown
  savedAt: number
}

function identityKey(): string | null {
  try {
    const raw = localStorage.getItem('tijara-boot-cache')
    if (!raw) return null
    const p = JSON.parse(raw) as { user?: { id?: string; orgId?: string } | null }
    const u = p.user
    if (!u?.id || !u?.orgId) return null
    return `${u.orgId}:${u.id}`
  } catch {
    return null
  }
}

/** Persist the bootstrap snapshot for the CURRENT identity. Fire-and-forget safe. */
export async function savePosSnapshot(data: unknown): Promise<void> {
  const identity = identityKey()
  if (!identity) return
  const db = await openDb()
  if (!db) return
  const envelope: PosSnapshotEnvelope = { identity, data, savedAt: Date.now() }
  await txPut(db, `pos-snapshot:${identity}`, envelope)
}

/**
 * Load the bootstrap snapshot for the CURRENT identity (null when absent or
 * when the stored snapshot belongs to another account — never serve another
 * user's catalog, mirroring the LS cache namespacing rule).
 */
export async function loadPosSnapshot(): Promise<unknown | null> {
  const identity = identityKey()
  if (!identity) return null
  const db = await openDb()
  if (!db) return null
  const env = (await txGet(db, `pos-snapshot:${identity}`)) as PosSnapshotEnvelope | undefined
  if (!env || env.identity !== identity) return null
  return env.data ?? null
}

/** Test/teardown helper: drop every stored snapshot. */
export async function clearPosSnapshots(): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}
