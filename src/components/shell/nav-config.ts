'use client'

import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  MonitorSmartphone,
  Package,
  Palette,
  Settings,
  ShoppingCart,
  Truck,
  UsersRound,
  Wallet,
  Warehouse,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ViewKey } from '@/stores/ui'

export interface NavItem {
  key: ViewKey
  labelKey: string
  icon: LucideIcon
}

export interface NavSection {
  labelKey: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: 'nav.group.main',
    items: [
      { key: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
      { key: 'pos', labelKey: 'nav.pos', icon: ShoppingCart },
    ],
  },
  {
    labelKey: 'nav.section.operations',
    items: [
      { key: 'catalog', labelKey: 'nav.catalog', icon: Package },
      { key: 'sales', labelKey: 'nav.sales', icon: ClipboardList },
      { key: 'purchases', labelKey: 'nav.purchases', icon: Truck },
      { key: 'stock', labelKey: 'nav.stock', icon: Warehouse },
      { key: 'finance', labelKey: 'nav.finance', icon: Wallet },
    ],
  },
  {
    labelKey: 'nav.section.directory',
    items: [
      { key: 'customers', labelKey: 'nav.customers', icon: UsersRound },
      { key: 'suppliers', labelKey: 'nav.suppliers', icon: Truck },
      { key: 'reports', labelKey: 'nav.reports', icon: BarChart3 },
    ],
  },
  {
    labelKey: 'nav.section.system',
    items: [
      { key: 'designer', labelKey: 'nav.designer', icon: Palette },
      { key: 'settings', labelKey: 'nav.settings', icon: Settings },
    ],
  },
]

export const VIEW_TITLE_KEYS: Record<ViewKey, string> = {
  dashboard: 'nav.dashboard',
  pos: 'nav.pos',
  catalog: 'nav.catalog',
  sales: 'nav.sales',
  purchases: 'nav.purchases',
  stock: 'nav.stock',
  customers: 'nav.customers',
  suppliers: 'nav.suppliers',
  finance: 'nav.finance',
  reports: 'nav.reports',
  designer: 'nav.designer',
  settings: 'nav.settings',
}

export const APP_ICON = MonitorSmartphone
