'use client'

import { clearPosSnapshots } from './pos-store'

/**
 * Purge every namespaced cached GET response (tijara-get:*) AND every
 * IndexedDB POS snapshot — identity switch / logout must leave no catalog
 * data behind on a shared device. Deliberately import-cycle-free: pos-store
 * has zero imports. The IDB purge is fire-and-forget (async store); the sync
 * LS purge completes immediately so callers keep their synchronous contract.
 */
export function clearGetCache() {
  try {
    const kill: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('tijara-get:')) kill.push(k)
    }
    kill.forEach((k) => localStorage.removeItem(k))
  } catch {}
  void clearPosSnapshots()
}
