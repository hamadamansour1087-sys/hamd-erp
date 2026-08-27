'use client'

import { create } from 'zustand'
import { round2Client } from '@/lib/format'

export interface CartLine {
  productId: string
  name: string
  price: number
  qty: number
  barcode?: string | null
  unitShort?: string | null
}

interface CartState {
  lines: CartLine[]
  customerId: string | null
  customerName: string
  discount: number
  note: string
  addLine: (line: Omit<CartLine, 'qty'> & { qty?: number }) => void
  incLine: (productId: string) => void
  decLine: (productId: string) => void
  removeLine: (productId: string) => void
  setPrice: (productId: string, price: number) => void
  setQty: (productId: string, qty: number) => void
  setCustomer: (id: string | null, name: string) => void
  setDiscount: (d: number) => void
  setNote: (n: string) => void
  clear: () => void
}

const LS_KEY = 'tijara-cart'

function persist(s: CartState) {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        lines: s.lines,
        customerId: s.customerId,
        customerName: s.customerName,
        discount: s.discount,
        note: s.note,
      })
    )
  } catch {}
}

function initial(): Pick<CartState, 'lines' | 'customerId' | 'customerName' | 'discount' | 'note'> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        lines: Array.isArray(p.lines) ? p.lines : [],
        customerId: p.customerId ?? null,
        customerName: p.customerName ?? '',
        discount: typeof p.discount === 'number' ? p.discount : 0,
        note: p.note ?? '',
      }
    }
  } catch {}
  return { lines: [], customerId: null, customerName: '', discount: 0, note: '' }
}

export const useCart = create<CartState>((set, get) => ({
  ...initial(),
  addLine: (line) => {
    set((s) => {
      const existing = s.lines.find((l) => l.productId === line.productId)
      let lines
      if (existing) {
        lines = s.lines.map((l) =>
          l.productId === line.productId ? { ...l, qty: round2Client(l.qty + (line.qty ?? 1)) } : l
        )
      } else {
        lines = [...s.lines, { ...line, qty: line.qty ?? 1 }]
      }
      return { ...s, lines }
    })
    persist(get())
  },
  incLine: (productId) => {
    set((s) => ({
      ...s,
      lines: s.lines.map((l) => (l.productId === productId ? { ...l, qty: round2Client(l.qty + 1) } : l)),
    }))
    persist(get())
  },
  decLine: (productId) => {
    set((s) => {
      const lines = s.lines
        .map((l) => (l.productId === productId ? { ...l, qty: round2Client(l.qty - 1) } : l))
        .filter((l) => l.qty > 0)
      return { ...s, lines }
    })
    persist(get())
  },
  removeLine: (productId) => {
    set((s) => ({ ...s, lines: s.lines.filter((l) => l.productId !== productId) }))
    persist(get())
  },
  setPrice: (productId, price) => {
    set((s) => ({ ...s, lines: s.lines.map((l) => (l.productId === productId ? { ...l, price } : l)) }))
    persist(get())
  },
  setQty: (productId, qty) => {
    set((s) => ({
      ...s,
      lines: qty <= 0 ? s.lines.filter((l) => l.productId !== productId) : s.lines.map((l) => (l.productId === productId ? { ...l, qty } : l)),
    }))
    persist(get())
  },
  setCustomer: (customerId, customerName) => {
    set({ customerId, customerName })
    persist(get())
  },
  setDiscount: (discount) => {
    set({ discount: Math.max(0, Number.isFinite(discount) ? discount : 0) })
    persist(get())
  },
  setNote: (note) => {
    set({ note })
    persist(get())
  },
  clear: () => {
    set({ lines: [], customerId: null, customerName: '', discount: 0, note: '' })
    persist(get())
  },
}))

export interface CartTotals {
  subtotal: number
  total: number
}

export function cartTotals(lines: CartLine[], discount: number, taxPercent: number): CartTotals {
  const subtotal = round2Client(lines.reduce((sum, l) => sum + l.price * l.qty, 0))
  const d = Math.min(discount || 0, subtotal)
  const tax = round2Client(((subtotal - d) * taxPercent) / 100)
  return { subtotal, total: round2Client(subtotal - d + tax) }
}
