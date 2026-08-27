'use client'

import { create } from 'zustand'
import type { OrgDTO, SessionUser } from '@/lib/types'
import { clearGetCache } from '@/lib/offline/cache-purge'

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
      if (prev && user && prev.id !== user.id) clearGetCache()
      if (prev && !user) clearGetCache()
    } catch {}
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
    set({ user: null, org: null, booted: true })
  },
}))
