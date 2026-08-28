'use client'

/**
 * Central view registry — OWNED BY ORCHESTRATOR.
 * Each ViewKey maps to a lazily-bundled default-exported React component.
 * Subagents replace ONLY their own view file contents; paths stay stable.
 */

import * as React from 'react'
import type { ViewKey } from '@/stores/ui'

const LOADERS: Record<ViewKey, () => Promise<{ default: React.ComponentType }>> = {
  dashboard: () => import('@/views/dashboard/DashboardView'),
  pos: () => import('@/views/pos/POSView'),
  catalog: () => import('@/views/catalog/CatalogView'),
  sales: () => import('@/views/sales/SalesView'),
  purchases: () => import('@/views/purchases/PurchasesView'),
  stock: () => import('@/views/stock/WarehousesView'),
  customers: () => import('@/views/people/CustomersView'),
  suppliers: () => import('@/views/people/SuppliersView'),
  finance: () => import('@/views/finance/FinanceView'),
  reports: () => import('@/views/reports/ReportsView'),
  settings: () => import('@/views/settings/SettingsView'),
}

export function ActiveView({ view }: { view: ViewKey }) {
  const [Comp, setComp] = React.useState<React.ComponentType | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    setComp(null)
    setFailed(false)
    LOADERS[view]()
      .then((m) => alive && setComp(() => m.default))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [view])

  if (failed) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Failed to load this screen. <button className="underline" onClick={() => location.reload()}>Reload</button>
      </div>
    )
  }
  if (!Comp) {
    return (
      <div className="flex items-center justify-center py-24" aria-busy>
        <span className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        <span className="sr-only">Loading…</span>
      </div>
    )
  }
  return (
    <React.Suspense fallback={<div className="py-24 text-center text-muted-foreground">…</div>}>
      <Comp />
    </React.Suspense>
  )
}
