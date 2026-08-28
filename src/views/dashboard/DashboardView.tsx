'use client'

/**
 * DashboardView — H.A.M.D home dashboard (Task 5-a owned file).
 * KPI grid + sales/profit area chart with range toggle +
 * best-sellers & stock-shortage side panels + quick actions strip.
 * Read-only for every role (CASHIER included); all strings via dash.* dict.
 */

import { Fragment, useMemo, useState, type ReactNode } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Banknote,
  CreditCard,
  FilePlus2,
  HandCoins,
  PackagePlus,
  PackageSearch,
  RefreshCw,
  Receipt,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/hooks/use-api'
import { useI18n } from '@/lib/i18n'
import { useSession } from '@/stores/session'
import { useUIStore, canAccess } from '@/stores/ui'
import type { ViewKey } from '@/stores/ui'
import type { ChartsResponse, DashboardKPIs } from '@/lib/types'
import { CHART_COLORS, LegendChips, MoneyTip, makeCompact } from '../reports/chart-parts'

const RANGES = [7, 30, 90] as const

/** API returns these two cash-flow fields but the shared interface omits them (not my file to edit). */
type KPIs = DashboardKPIs & { receiptsTotal: number; paymentsTotal: number }

export default function DashboardView() {
  const { t, lang, money, num } = useI18n()
  const setView = useUIStore((s) => s.setView)
  const user = useSession((s) => s.user)

  const [range, setRange] = useState<(typeof RANGES)[number]>(30)
  const canSeeReports = !!user && canAccess(user.role, 'reports')

  const kpis = useApi<KPIs>('/api/reports/dashboard')
  const charts = useApi<ChartsResponse>(canSeeReports ? `/api/reports/charts?days=${range}&lang=${lang}` : null)

  const compact = useMemo(() => makeCompact(lang), [lang])

  const refreshAll = () => {
    kpis.refetch()
    charts.refetch()
  }

  const firstLoad = kpis.loading && !kpis.data
  const salesSeries = charts.data?.salesSeries ?? []

  // ─────────────────────────── fragments ───────────────────────────

  const failed = !!kpis.error && !kpis.data
  const header = (
    <div className="flex items-center justify-end">
      <Button
        variant="outline"
        size="icon"
        onClick={refreshAll}
        aria-label={t('common.retry')}
        title={t('common.retry')}
      >
        <RefreshCw className={`size-4${kpis.loading ? ' animate-spin' : ''}`} />
      </Button>
    </div>
  )

  if (failed) {
    return (
      <div>
        {header}
        <EmptyState
          icon={RefreshCw}
          title={t('dash.loadFail')}
          action={
            <Button onClick={refreshAll}>
              <RefreshCw className="size-4 me-2" />
              {t('common.retry')}
            </Button>
          }
        />
      </div>
    )
  }

  // ---- KPI cards ----
  const k = kpis.data
  const kpiCards: Array<{
    label: string
    value: string
    sub?: string
    icon: LucideIcon
    tone?: string
    onClick?: () => void
  }> = [
    {
      label: t('dash.kpiTodaySales'),
      value: money(k?.todaySales ?? 0),
      sub: t('dash.kpiTodayInvoices', { n: num(k?.todayInvoices ?? 0, 0) }),
      icon: ShoppingCart,
      tone: 'default',
    },
    { label: t('dash.kpiMonthProfit'), value: money(k?.monthProfit ?? 0), icon: TrendingUp, tone: 'success' },
    { label: t('dash.kpiMonthSales'), value: money(k?.monthSales ?? 0), icon: Receipt },
    {
      label: t('dash.kpiMonthExpenses'),
      value: money(k?.monthExpenses ?? 0),
      icon: TrendingDown,
      tone: 'warn',
    },
    {
      label: t('dash.kpiCashInHand'),
      value: money(k?.cashInHand ?? 0),
      sub:
        k == null
          ? undefined
          : t('dash.cashFormula', {
              r: compact(k.receiptsTotal),
              p: compact(k.paymentsTotal),
              e: compact(k.monthExpenses),
            }),
      icon: Banknote,
      tone: 'info',
    },
    {
      label: t('dash.kpiReceivables'),
      value: money(k?.receivables ?? 0),
      sub: t('dash.receivablesHint'),
      icon: HandCoins,
      tone: 'danger',
      onClick: () => setView('reports'),
    },
    {
      label: t('dash.kpiPayables'),
      value: money(k?.payables ?? 0),
      sub: t('dash.payablesHint'),
      icon: CreditCard,
      tone: 'warn',
      onClick: () => setView('reports'),
    },
    {
      label: t('dash.kpiLowStock'),
      value: num(k?.lowStockCount ?? 0, 0),
      sub: t('dash.lowStockHint'),
      icon: PackageSearch,
      tone: (k?.lowStockCount ?? 0) > 0 ? 'danger' : 'success',
      onClick: () => setView('stock'),
    },
  ]

  // ---- Trend card body ----
  let trendBody: ReactNode
  if (charts.error && !charts.data) {
    trendBody = (
      <EmptyState
        icon={RefreshCw}
        title={t('rpt.loadFail')}
        action={
          <Button variant="outline" size="sm" onClick={charts.refetch}>
            {t('common.retry')}
          </Button>
        }
      />
    )
  } else if (charts.loading && !charts.data) {
    trendBody = <Skeleton className="h-[200px] md:h-[240px] w-full rounded-lg" />
  } else {
    trendBody = (
      <Fragment>
        <div dir="ltr" className="h-[200px] md:h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={salesSeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.sales} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART_COLORS.sales} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(128,128,128,.22)" />
              <XAxis
                dataKey="label"
                interval="preserveStartEnd"
                minTickGap={28}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => compact(Number(v))}
                width={48}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }}
                content={
                  <MoneyTip
                    fmt={money}
                    rows={[
                      { key: 'value', name: t('dash.legendSales'), dotColor: CHART_COLORS.sales },
                      { key: 'secondary', name: t('dash.legendProfit'), dotColor: CHART_COLORS.profit },
                    ]}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={CHART_COLORS.sales}
                strokeWidth={2}
                fill="url(#dashGrad)"
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="secondary"
                stroke={CHART_COLORS.profit}
                strokeWidth={1.75}
                strokeDasharray="5 4"
                dot={false}
              />
              </ComposedChart>
            </ResponsiveContainer>
        </div>
        <LegendChips
          className="mt-2"
          items={[
            { color: CHART_COLORS.sales, label: t('dash.legendSales') },
            { color: CHART_COLORS.profit, label: t('dash.legendProfit'), dashed: true },
          ]}
        />
      </Fragment>
    )
  }

  // ---- Top products panel ----
  const topRows = (charts.data?.topProducts ?? []).slice(0, 5)
  const topPanel =
    charts.loading && !charts.data ? (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-lg" />
        ))}
      </div>
    ) : topRows.length === 0 ? (
      <p className="py-8 text-center text-sm text-muted-foreground">{t('dash.emptyTop')}</p>
    ) : (
      <ol className="space-y-2">
        {topRows.map((p, i) => (
          <li key={`${p.label}-${i}`} className="flex items-center gap-2.5 rounded-lg border p-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold num-ltr">
              {num(i + 1, 0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.label}</p>
              <p className="text-xs text-muted-foreground num-ltr">× {num(p.secondary ?? 0, 0)}</p>
            </div>
            <span className="shrink-0 text-sm font-bold num-ltr">{money(p.value)}</span>
          </li>
        ))}
      </ol>
    )

  // ---- Low stock panel ----
  const lowRows = (charts.data?.lowStock ?? []).slice(0, 5)
  const lowPanel =
    charts.loading && !charts.data ? (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    ) : lowRows.length === 0 ? (
      <div className="flex flex-col items-center text-center py-8">
        <ShieldCheck className="size-9 text-emerald-500 mb-2" aria-hidden />
        <p className="font-medium text-sm">{t('dash.noLow')}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[28ch]">{t('dash.noLowHint')}</p>
      </div>
    ) : (
      <ul className="space-y-2.5">
        {lowRows.map((p) => {
          const pct = p.minQty > 0 ? (p.qty / p.minQty) * 100 : 100
          return (
            <li key={p.id}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="shrink-0 text-xs text-muted-foreground num-ltr">
                  {t('dash.qtyOfMin', { q: num(p.qty, 0), m: num(p.minQty, 0) })}
                </p>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${pct <= 50 ? 'bg-rose-500' : pct < 100 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.max(3, Math.min(100, pct))}%` }}
                />
              </div>
              {p.warehouseNames ? (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={p.warehouseNames}>
                  {t('dash.atWarehouses', { w: p.warehouseNames })}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    )

  // ---- Quick actions ----
  const quickActions: Array<{ key: string; icon: LucideIcon; view: ViewKey }> = [
    { key: 'dash.qkPos', icon: Zap, view: 'pos' },
    { key: 'dash.qkPurchase', icon: FilePlus2, view: 'purchases' },
    { key: 'dash.qkProduct', icon: PackagePlus, view: 'catalog' },
    { key: 'dash.qkReceipt', icon: ReceiptText, view: 'finance' },
  ]

  return (
    <div className="space-y-5">
      {header}

      {/* ── KPI grid ── */}
      <div className={`grid grid-cols-2 gap-3 xl:grid-cols-4 ${kpis.fromCache ? 'opacity-70 transition-opacity' : ''}`}>
        {(firstLoad ? Array.from({ length: 8 }, () => null) : kpiCards).map((c, i) =>
          c == null ? (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ) : (
            <StatCard
              key={c.label}
              label={c.label}
              value={c.value}
              sub={c.sub}
              icon={c.icon}
              tone={c.tone}
              onClick={c.onClick}
            />
          )
        )}
      </div>
      {k != null ? (
        <p className="-mt-3 text-center text-xs text-muted-foreground">
          {t('dash.countsLine', {
            p: num(k.counts.products, 0),
            c: num(k.counts.customers, 0),
            s: num(k.counts.suppliers, 0),
          })}
        </p>
      ) : (
        <div className="-mt-3 flex justify-center">
          <Skeleton className="h-4 w-56" />
        </div>
      )}

      {/* ── Main row: trend + side panels ── */}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px] items-start">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
            <div className="min-w-0">
              <CardTitle className="text-base">{t('dash.trendTitle')}</CardTitle>
              {k != null ? (
                <p className="text-xs text-muted-foreground mt-0.5">{t('dash.weekChip', { v: money(k.weekSales) })}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label={t('rpt.rangeLabel')}>
              {RANGES.map((r) => (
                <Button
                  key={r}
                  type="button"
                  size="sm"
                  variant={range === r ? 'default' : 'outline'}
                  onClick={() => setRange(r)}
                  className="h-8 rounded-full px-3 text-xs"
                >
                  {t(`dash.r${r}`)}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-0">{trendBody}</CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('dash.topProducts')}</CardTitle>
              <p className="text-xs text-muted-foreground">{t('dash.topProductsSub')}</p>
            </CardHeader>
            <CardContent className="pt-0">
              {topPanel}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3"
                onClick={() => setView('reports')}
                disabled={!canSeeReports}
              >
                {t('dash.viewAllReports')}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">{t('dash.lowStockTitle')}</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView('stock')}>
                {t('nav.stock')}
              </Button>
            </CardHeader>
            <CardContent className="pt-0">{lowPanel}</CardContent>
          </Card>
        </div>
      </div>

      {/* ── Quick actions strip ── */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">{t('dash.quickActions')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quickActions.map((a) => (
            <Button
              key={a.key}
              type="button"
              variant="outline"
              onClick={() => setView(a.view)}
              className="h-auto flex-col gap-1.5 py-4 hover:bg-muted/60"
            >
              <a.icon className="size-5 text-primary" aria-hidden />
              <span className="text-xs font-medium">{t(a.key)}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
