'use client'

/**
 * Purge every namespaced cached GET response (tijara-get:*).
 * Deliberately dependency-free so both `stores/session` and the offline queue
 * can use it without creating an import cycle.
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
}
