'use client'

import { create } from 'zustand'

export type ViewKey =
  | 'dashboard'
  | 'pos'
  | 'catalog'
  | 'sales'
  | 'purchases'
  | 'stock'
  | 'customers'
  | 'suppliers'
  | 'finance'
  | 'reports'
  | 'settings'
  | 'videos'

const CASHIER_ALLOWED: ViewKey[] = ['pos', 'sales', 'catalog', 'customers', 'dashboard', 'videos']

interface UIState {
  view: ViewKey
  sidebarOpen: boolean // mobile drawer
  collapsed: boolean // desktop mini mode
  accent: string
  setView: (v: ViewKey) => void
  setSidebarOpen: (open: boolean) => void
  toggleCollapsed: () => void
  setAccent: (a: string) => void
}

function applyAccent(a: string) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = a
    try {
      localStorage.setItem('tijara-accent', a)
    } catch {}
  }
}

export const useUIStore = create<UIState>((set) => ({
  view: 'dashboard',
  sidebarOpen: false,
  collapsed: false,
  accent: 'emerald',
  setView: (v) => {
    set({ view: v })
    // close mobile drawer on navigation
    set({ sidebarOpen: false })
  },
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleCollapsed: () =>
    set((s) => {
      try {
        localStorage.setItem('tijara-collapsed', s.collapsed ? '0' : '1')
      } catch {}
      return { collapsed: !s.collapsed }
    }),
  setAccent: (a) => {
    applyAccent(a)
    set({ accent: a })
  },
}))

export function canAccess(role: string, view: ViewKey): boolean {
  if (role !== 'CASHIER') return true
  return CASHIER_ALLOWED.includes(view)
}

export function initUIStore() {
  try {
    const accent = localStorage.getItem('tijara-accent') || 'emerald'
    applyAccent(accent)
    useUIStore.setState({ accent })
    const collapsed = localStorage.getItem('tijara-collapsed') === '1'
    useUIStore.setState({ collapsed })
  } catch {}
}
