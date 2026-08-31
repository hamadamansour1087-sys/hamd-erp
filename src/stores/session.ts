'use client'

import { create } from 'zustand'
import type { OrgDTO, SessionUser } from '@/lib/types'
import { clearGetCache } from '@/lib/offline/cache-purge'
import { resetSessionExpiry } from '@/lib/offline/queue'
import { useCart } from '@/stores/cart'

/**
 * Shared-device hygiene for logout / user switch:
 *  - PURGE_DATA drops the service worker's URL-keyed API GET cache (it has no
 *    identity namespace — without this the NEXT user on the terminal could be
 *    served the PREVIOUS tenant's data on a transient network failure).
 *  - The cart is identity-agnostic localStorage; inheriting another cashier's
 *    half-built cart books sales under the wrong customer.
 * Both are fire-and-forget: logout must never block on them.
 */
function purgeSharedDeviceState() {
  try {
    navigator.serviceWorker?.controller?.postMessage('PURGE_DATA')
  } catch {}
  try {
    useCart.getState().clear()
  } catch {}
}

interface SessionState {
  user: SessionUser | null
  org: OrgDTO | null
  booted: boolean
  bootFailed: boolean
  setSession: (user: SessionUser | null, org: OrgDTO | null) => void
  bootstrap: () => Promise<void>
  logout: () => Promise<void>
}

const CACHE_KEY = 'tijara-boot-cache'

export function readBootCache(): { user: SessionUser | null; org: OrgDTO | null } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    return { user: p.user ?? null, org: p.org ?? null }
  } catch {
    return null
  }
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  org: null,
  booted: false,
  bootFailed: false,
  setSession: (user, org) => {
    try {
      // Identity switch must never serve cached GET responses from another account.
      const prev = useSession.getState().user
      if (prev && user && prev.id !== user.id) {
        clearGetCache()
        purgeSharedDeviceState()
      }
      if (prev && !user) {
        clearGetCache()
        purgeSharedDeviceState()
      }
    } catch {}
    // A successful login (any path) re-arms the offline sync replay — the 401
    // gate from a previous expired session must not outlive that session.
    if (user) resetSessionExpiry()
    try {
      if (user && org) localStorage.setItem(CACHE_KEY, JSON.stringify({ user, org }))
      else localStorage.removeItem(CACHE_KEY)
      if (org?.currencyCode) localStorage.setItem('tijara-currency', org.currencyCode)
    } catch {}
    set({ user, org, booted: true, bootFailed: false })
  },
  bootstrap: async () => {
    try {
      const res = await fetch('/api/bootstrap', { credentials: 'include' })
      if (!res.ok) {
        // Not authenticated (401) → clear stale cache silently
        const cached = readBootCache()
        set({
          user: res.status === 401 ? null : cached?.user ?? null,
          org: res.status === 401 ? null : cached?.org ?? null,
          booted: true,
          bootFailed: false,
        })
        return
      }
      const json = await res.json()
      set({ user: json.data.user, org: json.data.org, booted: true, bootFailed: false })
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ user: json.data.user, org: json.data.org }))
        localStorage.setItem('tijara-currency', json.data.org.currencyCode)
      } catch {}
    } catch {
      // network failure → fall back to cached session so PWA keeps working offline
      const cached = readBootCache()
      set({ user: cached?.user ?? null, org: cached?.org ?? null, booted: true, bootFailed: !cached })
    }
  },
  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {}
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {}
    // Purge every cached GET response — queued offline mutations are intentionally
    // kept but can only be replayed after re-login as the SAME user (see queue.ts).
    clearGetCache()
    // Drop the SW API-GET cache + cart: a shared terminal must not hand the
    // previous user's tenant data (or half-built cart) to the next login.
    purgeSharedDeviceState()
    set({ user: null, org: null, booted: true })
  },
}))
