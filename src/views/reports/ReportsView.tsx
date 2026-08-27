'use client'

/**
 * ReportsView — التقارير (Task 5-a owned file).
 * 4 tabs: Overview (sales/profit + purchases charts), Products & categories
 * (ranked bars + donut), Inventory (valuation + low-stock table + CSV),
 * Balances (receivables/payables with copy-phone). CASHIER gets a lock card.
 * All strings via rpt.* dict; charts wrapped dir="ltr" for RTL safety.
 */

import { useMemo, useState, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowDownLeft,
  BookOpenCheck,
  Boxes,
  Copy,
  Download,
  FileDown,
  FileJson,
  FileSpreadsheet,
  Landmark,
  Lock,
  Printer,
  ReceiptText,
  RefreshCw,
  Sheet,
  TrendingUp,
  TriangleAlert,
  Truck,
  UsersRound,
  Wallet,
} from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { useApi } from '@/hooks/use-api'
import { useI18n } from '@/lib/i18n'
import { useSession } from '@/stores/session'
import type { ChartsResponse } from '@/lib/types'
import {
  CHART_COLORS,
  LegendChips,
  MoneyTip,
  PIE_PALETTE,
  YMD,
  downloadBlob,
  downloadCsv,
  makeCompact,
  printReport,
  type BalancesDTO,
  type ReportPrintTable,
} from './chart-parts'
import { downloadReportPdf } from '@/lib/reports/report-pdf'

const DAYS = [7, 30, 90, 180] as const

/** Shared export dropdown — one menu, many destinations (CSV / JSON / print-PDF). */
function ExportMenu({
  items,
  label,
  disabled,
}: {
  items: Array<{ label: string; icon: typeof FileJson; onSelect: () => void }>
  label: string
  disabled?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} aria-label={label}>
          <Download className="size-4 me-2" aria-hidden />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {items.map((it) => (
          <DropdownMenuItem key={it.label} onClick={it.onSelect} className="gap-2">
            <it.icon className="size-4 text-muted-foreground" aria-hidden />
            <span>{it.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** One receivables/payables panel (module-scope so it never remounts). */
function PartySection({
  kind,
  rows,
  title,
  sub,
  empty,
  emptyHint,
  chipLabel,
  total,
  t,
  money,
}: {
  kind: 'customer' | 'supplier'
  rows: BalancesDTO['customers']
  title: string
  sub: string
  empty: string
  emptyHint: string
  chipLabel: string
  total: number
  t: (k: string) => string
  money: (n: number) => string
}) {
  const initials = (name: string) => name.trim().charAt(0) || '?'
  const copyPhone = (phone: string) => {
    navigator.clipboard
      ?.writeText(phone)
      .then(() => toast.success(t('common.copySuccess')))
      .catch(() => {})
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          {kind === 'customer' ? (
            <UsersRound className="size-4 text-primary" aria-hidden />
          ) : (
            <Truck className="size-4 text-primary" aria-hidden />
          )}
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center text-center py-8">
            <span className="text-2xl mb-1" aria-hidden>🎉</span>
            <p className="font-medium text-sm">{empty}</p>
            <p className="text-xs text-muted-foreground mt-1">{emptyHint}</p>
          </div>
        ) : (
          <>
            <ul className="divide-y max-h-[340px] overflow-auto scrollbar-thin">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-2.5 py-2.5">
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      kind === 'customer'
                        ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    }`}
                    aria-hidden
                  >
                    {initials(r.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    {r.phone ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="num-ltr">{r.phone}</span>
                        <button
                          type="button"
                          className="inline-flex size-5 items-center justify-center rounded hover:bg-muted"
                          aria-label={t('rpt.copyPhone')}
                          title={t('rpt.copyPhone')}
                          onClick={() => copyPhone(r.phone ?? '')}
                        >
                          <Copy className="size-3" aria-hidden />
                        </button>
                      </span>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold num-ltr ${
                      r.owed > 0
                        ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {money(Math.abs(r.owed))}
                    {r.owed < 0 ? <span className="ms-1 font-medium">({t('rpt.creditInFavor')})</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t pt-2.5 text-sm">
              <span className="text-muted-foreground">{chipLabel}</span>
              <span
                className={`font-bold num-ltr ${
                  kind === 'customer' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {money(total)}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function ReportsView() {
  const { t, lang, money, num } = useI18n()
  const user = useSession((s) => s.user)
  const org = useSession((s) => s.org)
  const orgName = org?.name
  // Lock until a known staff session exists (prevents boot-flash leaks)
  const locked = !user || user.role === 'CASHIER'

  const [days, setDays] = useState<(typeof DAYS)[number]>(30)

  const charts = useApi<ChartsResponse>(locked ? null : `/api/reports/charts?days=${days}&lang=${lang}`)
  const balances = useApi<BalancesDTO>(locked ? null : '/api/reports/balances')

  const compact = useMemo(() => makeCompact(lang), [lang])

  // ── shared export helpers (print / PDF / Excel) ──
  interface DocModel {
    slug: string
    title: string
    kpis: Array<{ label: string; value: string }>
    tables: ReportPrintTable[]
  }

  const printDoc = (m: DocModel) => {
    const opened = printReport({
      title: m.title,
      subtitle: t('rpt.sub'),
      brand: orgName || 'H.A.M.D',
      logo: org?.logo ?? null,
      phone: org?.phone ?? null,
      address: org?.address ?? null,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      rangeLabel: t(`rpt.range${days}Days`),
      kpis: m.kpis,
      tables: m.tables,
    })
    if (!opened) toast.error(t('rpt.printBlocked'))
  }

  const exportPdf = (m: DocModel) => {
    toast.promise(
      downloadReportPdf({
        title: m.title,
        subtitle: t('rpt.sub'),
        brand: orgName || 'H.A.M.D',
        logo: org?.logo ?? null,
        phone: org?.phone ?? null,
        address: org?.address ?? null,
        dir: lang === 'ar' ? 'rtl' : 'ltr',
        rangeLabel: t(`rpt.range${days}Days`),
        kpis: m.kpis,
        tables: m.tables,
        filename: `hamd-${m.slug}-${YMD()}.pdf`,
      }),
      { loading: t('rpt.exporting'), success: t('rpt.exportPdfDone'), error: t('rpt.exportFailed') },
    )
  }

  /** Styled .xlsx via server-side ExcelJS (letterhead + logo + RTL in Arabic). */
  const exportExcel = (report: 'overview' | 'products' | 'stock' | 'balances') => {
    toast.promise(
      (async () => {
        const res = await fetch('/api/reports/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report, days, lang }),
        })
        if (!res.ok) throw new Error(String(res.status))
        downloadBlob(await res.blob(), `hamd-${report}-${report === 'balances' ? 'all' : `${days}d`}-${YMD()}.xlsx`)
      })(),
      { loading: t('rpt.exporting'), success: t('rpt.exportExcelDone'), error: t('rpt.exportFailed') },
    )
  }

  // ── export helpers: overview ──
  const exportJson = () => {
    if (!charts.data) return
    downloadBlob(
      new Blob([JSON.stringify(charts.data, null, 2)], { type: 'application/json' }),
      `hamd-charts-${days}d-${YMD()}.json`
    )
    toast.success(t('rpt.exportJson'))
  }

  const exportDailyCsv = () => {
    const s = charts.data?.salesSeries ?? []
    const p = charts.data?.purchasesSeries ?? []
    const e = charts.data?.expenseSeries ?? []
    if (s.length === 0) return
    downloadCsv(
      `hamd-daily-${days}d-${YMD()}.csv`,
      [t('rpt.colDay'), t('rpt.salesOnly'), t('rpt.profitOnly'), t('rpt.purchasesTrend'), t('rpt.kpiExpenses'), t('rpt.colInvoices')],
      [
        ...s.map((row, i) => [row.label, row.value, row.secondary ?? 0, p[i]?.value ?? 0, e[i]?.value ?? 0, row.count ?? 0]),
        [t('rpt.rowTotal'), salesTotal, profitTotal, purchTotal, expenseTotal, ''],
      ]
    )
    toast.success(t('rpt.exportCsv'))
  }

  const overviewDoc = (): DocModel | null => {
    if (!charts.data) return null
    const daily: ReportPrintTable = {
      title: t('rpt.exportDailyCsv').replace('CSV — ', ''),
      headers: [t('rpt.colDay'), t('rpt.salesOnly'), t('rpt.profitOnly'), t('rpt.purchasesTrend'), t('rpt.kpiExpenses'), t('rpt.colInvoices')],
      rows: charts.data.salesSeries.map((row, i) => [
        row.label,
        money(row.value),
        money(row.secondary ?? 0),
        money(charts.data!.purchasesSeries[i]?.value ?? 0),
        money(charts.data!.expenseSeries[i]?.value ?? 0),
        num(row.count ?? 0, 0),
      ]),
    }
    return {
      slug: 'overview',
      title: t('rpt.tabOverview'),
      kpis: [
        { label: t('rpt.kpiSales'), value: money(salesTotal) },
        { label: t('rpt.kpiProfit'), value: money(profitTotal) },
        { label: t('rpt.kpiExpenses'), value: money(expenseTotal) },
        { label: t('rpt.kpiNet'), value: money(netProfit) },
      ],
      tables: [daily],
    }
  }
  const printOverview = () => { const m = overviewDoc(); if (m) printDoc(m) }
  const pdfOverview = () => { const m = overviewDoc(); if (m) exportPdf(m) }

  // ── export helpers: products ──
  const exportProductsCsv = () => {
    const prods = charts.data?.topProducts ?? []
    if (prods.length === 0) return
    downloadCsv(
      `hamd-top-products-${days}d-${YMD()}.csv`,
      [t('rpt.colProduct'), t('rpt.colQtySold'), t('rpt.colRevenue'), t('rpt.colShare')],
      prods.map((p) => [p.label, p.secondary ?? 0, p.value, salesTotal > 0 ? `${Math.round((p.value / salesTotal) * 100)}%` : '0%'])
    )
    toast.success(t('rpt.exportCsv'))
  }

  const exportCategoriesCsv = () => {
    const cats = charts.data?.topCategories ?? []
    if (cats.length === 0) return
    downloadCsv(
      `hamd-categories-${days}d-${YMD()}.csv`,
      [t('rpt.colCategory'), t('rpt.colRevenue'), t('rpt.colShare')],
      cats.map((c) => [c.label, c.value, catTotal > 0 ? `${Math.round((c.value / catTotal) * 100)}%` : '0%'])
    )
    toast.success(t('rpt.exportCsv'))
  }

  const productsDoc = (): DocModel | null => {
    if (!charts.data) return null
    const prodTable: ReportPrintTable = {
      title: t('rpt.topProducts'),
      headers: ['#', t('rpt.colProduct'), t('rpt.colQtySold'), t('rpt.colRevenue'), t('rpt.colShare')],
      rows: charts.data.topProducts.map((p, i) => [num(i + 1, 0), p.label, num(p.secondary ?? 0, 0), money(p.value), salesTotal > 0 ? `${Math.round((p.value / salesTotal) * 100)}%` : '0%']),
    }
    const catTable: ReportPrintTable = {
      title: t('rpt.topCategories'),
      headers: [t('rpt.colCategory'), t('rpt.colRevenue'), t('rpt.colShare')],
      rows: charts.data.topCategories.map((c) => [c.label, money(c.value), catTotal > 0 ? `${Math.round((c.value / catTotal) * 100)}%` : '0%']),
    }
    return {
      slug: 'products',
      title: t('rpt.tabProducts'),
      kpis: [{ label: t('rpt.kpiSales'), value: money(salesTotal) }],
      tables: [prodTable, catTable],
    }
  }
  const printProducts = () => { const m = productsDoc(); if (m) printDoc(m) }
  const pdfProducts = () => { const m = productsDoc(); if (m) exportPdf(m) }

  // ── export helpers: stock ──
  const exportLowsCsv = () => {
    const lows = charts.data?.lowStock ?? []
    if (lows.length === 0) return
    downloadCsv(
      `hamd-low-stock-${YMD()}.csv`,
      [t('rpt.colProduct'), t('common.barcode'), t('rpt.colAvailable'), t('rpt.colMin'), t('rpt.colStatus'), t('rpt.colWarehouses')],
      lows.map((l) => [
        l.name,
        l.barcode ?? '',
        l.qty,
        l.minQty,
        `${l.minQty > 0 ? Math.round((l.qty / l.minQty) * 100) : 100}%`,
        l.warehouseNames ?? '',
      ])
    )
    toast.success(t('rpt.exportCsv'))
  }

  const stockDoc = (): DocModel | null => {
    if (!charts.data) return null
    const lowsTable: ReportPrintTable = {
      title: t('rpt.tabStock'),
      headers: [t('rpt.colProduct'), t('common.barcode'), t('rpt.colAvailable'), t('rpt.colMin'), t('rpt.colStatus'), t('rpt.colWarehouses')],
      rows: charts.data.lowStock.map((l) => [
        l.name,
        l.barcode ?? '—',
        num(l.qty, 0),
        num(l.minQty, 0),
        `${l.minQty > 0 ? Math.round((l.qty / l.minQty) * 100) : 100}%`,
        l.warehouseNames || '—',
      ]),
    }
    return {
      slug: 'stock',
      title: t('rpt.tabStock'),
      kpis: [
        { label: t('rpt.valuation'), value: money(charts.data.valuation) },
        { label: t('rpt.lowsCount'), value: num(charts.data.lowStock.length, 0) },
      ],
      tables: [lowsTable],
    }
  }
  const printStock = () => { const m = stockDoc(); if (m) printDoc(m) }
  const pdfStock = () => { const m = stockDoc(); if (m) exportPdf(m) }

  // ── export helpers: balances ──
  const exportBalancesCsv = (kind: 'customers' | 'suppliers') => {
    const rows = balances.data?.[kind] ?? []
    if (rows.length === 0) return
    downloadCsv(
      `hamd-${kind}-balances-${YMD()}.csv`,
      [kind === 'customers' ? t('rpt.colCustomer') : t('nav.suppliers'), t('rpt.colPhone'), t('rpt.colOwed')],
      rows.map((r) => [r.name, r.phone ?? '', r.owed])
    )
    toast.success(t('rpt.exportCsv'))
  }

  const balancesDoc = (): DocModel | null => {
    const b = balances.data
    if (!b) return null
    const custTable: ReportPrintTable = {
      title: t('rpt.receivablesTitle'),
      headers: [t('rpt.colCustomer'), t('rpt.colPhone'), t('rpt.colOwed')],
      rows: b.customers.map((r) => [r.name, r.phone ?? '—', money(Math.abs(r.owed))]),
    }
    const supTable: ReportPrintTable = {
      title: t('rpt.payablesTitle'),
      headers: [t('nav.suppliers'), t('rpt.colPhone'), t('rpt.colOwed')],
      rows: b.suppliers.map((r) => [r.name, r.phone ?? '—', money(Math.abs(r.owed))]),
    }
    return {
      slug: 'balances',
      title: t('rpt.tabBalances'),
      kpis: [
        { label: t('rpt.totalReceivables'), value: money(b.totals.receivables) },
        { label: t('rpt.totalPayables'), value: money(b.totals.payables) },
        { label: t('rpt.netPosition'), value: money(b.totals.receivables - b.totals.payables) },
      ],
      tables: [custTable, supTable],
    }
  }
  const printBalances = () => { const m = balancesDoc(); if (m) printDoc(m) }
  const pdfBalances = () => { const m = balancesDoc(); if (m) exportPdf(m) }

  // ─────────────────────────── derived pieces ───────────────────────────

  const header = (
    <PageHeader
      icon={<BookOpenCheck className="size-5" />}
      title={t('rpt.title')}
      subtitle={t('rpt.sub')}
      actions={
        !locked ? (
          <Button variant="outline" size="sm" onClick={() => { charts.refetch(); balances.refetch() }} aria-label={t('common.retry')}>
            <RefreshCw className={`size-4 me-2${charts.loading ? ' animate-spin' : ''}`} />
            {t('common.today')}
          </Button>
        ) : undefined
      }
    />
  )

  if (locked) {
    return (
      <div>
        {header}
        <EmptyState icon={Lock} title={t('rpt.locked')} hint={t('rpt.lockedHint')} />
      </div>
    )
  }

  const salesTotal = (charts.data?.salesSeries ?? []).reduce((a, p) => a + p.value, 0)
  const profitTotal = (charts.data?.salesSeries ?? []).reduce((a, p) => a + (p.secondary ?? 0), 0)
  const expenseTotal = (charts.data?.expenseSeries ?? []).reduce((a, p) => a + p.value, 0)
  const netProfit = profitTotal - expenseTotal
  const purchTotal = (charts.data?.purchasesSeries ?? []).reduce((a, p) => a + p.value, 0)
  const purchAvg =
    charts.data && charts.data.purchasesSeries.length > 0 ? purchTotal / charts.data.purchasesSeries.length : 0
  const topCusts = charts.data?.topCustomers ?? []
  const maxCust = topCusts.length > 0 ? Math.max(...topCusts.map((c) => c.value), 1) : 1

  const rangeSelect = (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{t('rpt.rangeLabel')}</span>
      <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as (typeof DAYS)[number])}>
        <SelectTrigger size="sm" className="w-[150px]" aria-label={t('rpt.rangeLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DAYS.map((d) => (
            <SelectItem key={d} value={String(d)}>
              {t(`rpt.range${d}Days`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  let overviewBody: ReactNode
  if (charts.error && !charts.data) {
    overviewBody = (
      <EmptyState
        icon={RefreshCw}
        title={t('rpt.loadFail')}
        action={
          <Button variant="outline" onClick={charts.refetch}>
            {t('common.retry')}
          </Button>
        }
      />
    )
  } else if (charts.loading && !charts.data) {
    overviewBody = (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    )
  } else {
    overviewBody = (
      <div className="space-y-4">
        {/* KPI summary — the range at a glance */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label={t('rpt.kpiSales')} value={money(salesTotal)} icon={TrendingUp} tone="success" />
          <StatCard label={t('rpt.kpiProfit')} value={money(profitTotal)} icon={Wallet} tone="default" />
          <StatCard label={t('rpt.kpiExpenses')} value={money(expenseTotal)} icon={ReceiptText} tone="warn" />
          <StatCard
            label={t('rpt.kpiNet')}
            value={money(netProfit)}
            icon={Landmark}
            tone={netProfit >= 0 ? 'info' : 'danger'}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
        {/* Sales & profit */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('rpt.salesTrend')}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('rpt.periodTotal', { v: money(salesTotal) })}</p>
          </CardHeader>
          <CardContent className="pt-0">
            <div dir="ltr" className="h-[230px] md:h-[270px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={charts.data?.salesSeries ?? []} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="rptGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.sales} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CHART_COLORS.sales} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(128,128,128,.22)" />
                  <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={28} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v: number) => compact(Number(v))} width={48} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }}
                    content={
                      <MoneyTip
                        fmt={money}
                        rows={[
                          { key: 'value', name: t('rpt.salesOnly'), dotColor: CHART_COLORS.sales },
                          { key: 'secondary', name: t('rpt.profitOnly'), dotColor: CHART_COLORS.profit },
                        ]}
                      />
                    }
                  />
                  <Area type="monotone" dataKey="value" stroke={CHART_COLORS.sales} strokeWidth={2} fill="url(#rptGrad)" dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="secondary" stroke={CHART_COLORS.profit} strokeWidth={1.75} strokeDasharray="5 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <LegendChips
              className="mt-2"
              items={[
                { color: CHART_COLORS.sales, label: t('rpt.salesOnly') },
                { color: CHART_COLORS.profit, label: t('rpt.profitOnly'), dashed: true },
              ]}
            />
          </CardContent>
        </Card>

        {/* Purchases */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('rpt.purchasesTrend')}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('rpt.periodTotal', { v: money(purchTotal) })}</p>
          </CardHeader>
          <CardContent className="pt-0">
            <div dir="ltr" className="h-[230px] md:h-[270px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.data?.purchasesSeries ?? []} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(128,128,128,.22)" />
                  <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={28} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v: number) => compact(Number(v))} width={48} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(148,163,184,.12)' }}
                    content={<MoneyTip fmt={money} rows={[{ key: 'value', name: t('rpt.purchasesTrend'), dotColor: CHART_COLORS.purchase }]} />}
                  />
                  <ReferenceLine y={purchAvg} stroke={CHART_COLORS.negative} strokeDasharray="5 4" strokeWidth={1.25} />
                  <Bar dataKey="value" fill={CHART_COLORS.purchase} radius={[6, 6, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <LegendChips
              className="mt-2"
              items={[
                { color: CHART_COLORS.purchase, label: t('rpt.purchasesTrend') },
                { color: CHART_COLORS.negative, label: t('rpt.avgPurchases', { v: compact(purchAvg) }), dashed: true },
              ]}
            />
          </CardContent>
        </Card>

        {/* Expenses trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('rpt.expensesTrend')}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('rpt.expensesHint')} — {t('rpt.periodTotal', { v: money(expenseTotal) })}</p>
          </CardHeader>
          <CardContent className="pt-0">
            <div dir="ltr" className="h-[230px] md:h-[270px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts.data?.expenseSeries ?? []} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="rptExpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.negative} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CHART_COLORS.negative} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(128,128,128,.22)" />
                  <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={28} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v: number) => compact(Number(v))} width={48} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }}
                    content={<MoneyTip fmt={money} rows={[{ key: 'value', name: t('rpt.kpiExpenses'), dotColor: CHART_COLORS.negative }]} />}
                  />
                  <Area type="monotone" dataKey="value" stroke={CHART_COLORS.negative} strokeWidth={2} fill="url(#rptExpGrad)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <LegendChips className="mt-2" items={[{ color: CHART_COLORS.negative, label: t('rpt.kpiExpenses') }]} />
          </CardContent>
        </Card>

        {/* Top customers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('rpt.topCustomers')}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('rpt.topCustomersHint')}</p>
          </CardHeader>
          <CardContent className="pt-0">
            {topCusts.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t('rpt.noCustomerData')}</p>
            ) : (
              <ul className="space-y-2">
                {topCusts.map((c, i) => {
                  const pct = maxCust > 0 ? Math.max(3, Math.round((c.value / maxCust) * 100)) : 3
                  return (
                    <li key={`${c.label}-${i}`} className="relative isolate overflow-hidden rounded-lg border p-2.5">
                      <div aria-hidden className="absolute inset-y-0 start-0 -z-10 bg-teal-500/10" style={{ width: `${pct}%` }} />
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-500/10 text-xs font-bold num-ltr">
                          {num(i + 1, 0)}
                        </span>
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">{c.label}</p>
                        <span className="shrink-0 text-sm font-bold num-ltr">{money(c.value)}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    )
  }

  // ---- Products tab ----
  const prods = charts.data?.topProducts ?? []
  const cats = charts.data?.topCategories ?? []
  const catTotal = cats.reduce((a, c) => a + c.value, 0)
  const maxProd = prods.length > 0 ? Math.max(...prods.map((p) => p.value), 1) : 1

  let productsBody: ReactNode
  if (charts.error && !charts.data) {
    productsBody = (
      <EmptyState
        icon={RefreshCw}
        title={t('rpt.loadFail')}
        action={
          <Button variant="outline" onClick={charts.refetch}>
            {t('common.retry')}
          </Button>
        }
      />
    )
  } else if (charts.loading && !charts.data) {
    productsBody = (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[360px] rounded-xl" />
        <Skeleton className="h-[360px] rounded-xl" />
      </div>
    )
  } else {
    productsBody = (
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {/* Ranked top products */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('rpt.topProducts')}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('rpt.topProductsHint')}</p>
          </CardHeader>
          <CardContent className="pt-0">
            {prods.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t('rpt.noProdData')}</p>
            ) : (
              <ol className="space-y-2">
                {prods.map((p, i) => {
                  const pct = Math.max(3, Math.round((p.value / maxProd) * 100))
                  return (
                    <li key={`${p.label}-${i}`} className="relative isolate overflow-hidden rounded-lg border p-2.5">
                      <div aria-hidden className="absolute inset-y-0 start-0 -z-10 bg-emerald-500/10" style={{ width: `${pct}%` }} />
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold num-ltr">
                          {num(i + 1, 0)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.label}</p>
                          <p className="text-xs text-muted-foreground">{t('rpt.qtySold', { n: num(p.secondary ?? 0, 0) })}</p>
                        </div>
                        <div className="shrink-0 text-end">
                          <p className="text-sm font-bold num-ltr">{money(p.value)}</p>
                          <p className="text-[11px] text-muted-foreground num-ltr">{pct}%</p>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
            {prods.length > 0 ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">{t('rpt.showingTopN', { n: num(prods.length, 0) })}</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Categories donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('rpt.topCategories')}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('rpt.topCategoriesHint')}</p>
          </CardHeader>
          <CardContent className="pt-0">
            {cats.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t('rpt.noCatData')}</p>
            ) : (
              <>
                <div className="relative h-[240px] w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip
                        content={
                          <MoneyTip
                            fmt={money}
                            rows={[{ key: 'value', name: t('common.revenue'), dotColor: CHART_COLORS.sales }]}
                          />
                        }
                      />
                      <Pie
                        data={cats}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={62}
                        outerRadius={95}
                        paddingAngle={2}
                        cornerRadius={4}
                        strokeWidth={0}
                      >
                        {cats.map((_, i) => (
                          <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-[11px] text-muted-foreground">{t('common.total')}</p>
                    <p className="font-bold num-ltr">{compact(catTotal)}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {cats.map((c, i) => {
                    const pct = catTotal > 0 ? Math.round((c.value / catTotal) * 100) : 0
                    return (
                      <li key={`${c.label}-${i}`} className="flex items-center gap-2 text-sm">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: PIE_PALETTE[i % PIE_PALETTE.length] }} aria-hidden />
                        <span className="truncate">{c.label}</span>
                        <span className="ms-auto shrink-0 text-xs font-semibold num-ltr">{pct}%</span>
                        <span className="w-24 shrink-0 text-end text-xs text-muted-foreground num-ltr truncate">{money(c.value)}</span>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- Stock tab ----
  const lows = charts.data?.lowStock ?? []
  let stockBody: ReactNode
  if (charts.error && !charts.data) {
    stockBody = (
      <EmptyState
        icon={RefreshCw}
        title={t('rpt.loadFail')}
        action={
          <Button variant="outline" onClick={charts.refetch}>
            {t('common.retry')}
          </Button>
        }
      />
    )
  } else if (charts.loading && !charts.data) {
    stockBody = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:max-w-md">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-[320px] rounded-xl" />
      </div>
    )
  } else {
    stockBody = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label={t('rpt.valuation')} value={money(charts.data?.valuation ?? 0)} sub={t('rpt.valuationHint')} icon={Wallet} tone="default" />
          <StatCard
            label={t('rpt.lowsCount')}
            value={num(lows.length, 0)}
            sub={t('rpt.lowsCountSub', { n: num(lows.length, 0) })}
            icon={TriangleAlert}
            tone={lows.length > 0 ? 'danger' : 'success'}
          />
        </div>

        {lows.length === 0 ? (
          <EmptyState icon={Boxes} title={t('rpt.allGood')} hint={t('rpt.allGoodHint')} />
        ) : (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-base">{t('rpt.tabStock')}</CardTitle>
              <ExportMenu
                label={t('rpt.exportMenu')}
                disabled={!charts.data}
                items={[
                  { label: t('rpt.exportExcel'), icon: Sheet, onSelect: () => exportExcel('stock') },
                  { label: t('rpt.exportPdf'), icon: FileDown, onSelect: pdfStock },
                  { label: t('rpt.exportCsv'), icon: FileSpreadsheet, onSelect: exportLowsCsv },
                  { label: t('rpt.exportJson'), icon: FileJson, onSelect: exportJson },
                  { label: t('rpt.exportPrint'), icon: Printer, onSelect: printStock },
                ]}
              />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[430px] overflow-auto rounded-lg border scrollbar-thin">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                    <tr className="border-b">
                      {[t('rpt.colProduct'), t('common.barcode'), t('rpt.colAvailable'), t('rpt.colMin'), t('rpt.colStatus'), t('rpt.colWarehouses')].map(
                        (h, i) => (
                          <th key={i} className={`px-3 py-2 text-start text-xs font-medium text-muted-foreground ${i >= 2 && i <= 4 ? 'whitespace-nowrap' : ''}`}>
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {lows.map((l) => {
                      const pct = l.minQty > 0 ? (l.qty / l.minQty) * 100 : 100
                      return (
                        <tr key={l.id} className="border-b last:border-b-0 hover:bg-muted/40">
                          <td className="px-3 py-2.5">
                            <p className="max-w-[220px] truncate font-medium">{l.name}</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-xs text-muted-foreground font-mono num-ltr">{l.barcode || t('rpt.noneRecorded')}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`font-bold num-ltr ${l.qty <= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                              {num(l.qty, 0)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 num-ltr">{num(l.minQty, 0)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2" title={t('rpt.coverageHint')}>
                              <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                  style={{ width: `${Math.max(3, Math.min(100, pct))}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground num-ltr">{Math.round(pct)}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="block max-w-[200px] truncate text-xs text-muted-foreground" title={l.warehouseNames || undefined}>
                              {l.warehouseNames || t('rpt.noneRecorded')}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  // ---- Balances tab ----
  let balancesBody: ReactNode
  if (balances.error && !balances.data) {
    balancesBody = (
      <EmptyState
        icon={RefreshCw}
        title={t('rpt.loadFail')}
        action={
          <Button variant="outline" onClick={balances.refetch}>
            {t('common.retry')}
          </Button>
        }
      />
    )
  } else if (balances.loading && !balances.data) {
    balancesBody = (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[380px] rounded-xl" />
        <Skeleton className="h-[380px] rounded-xl" />
      </div>
    )
  } else {
    const b = balances.data!
    const net = b.totals.receivables - b.totals.payables

    balancesBody = (
      <div className="space-y-4">
        <div className="flex justify-end">
          <ExportMenu
            label={t('rpt.exportMenu')}
            disabled={!balances.data}
            items={[
              { label: t('rpt.exportExcel'), icon: Sheet, onSelect: () => exportExcel('balances') },
              { label: t('rpt.exportPdf'), icon: FileDown, onSelect: pdfBalances },
              { label: t('rpt.exportCustomersCsv'), icon: FileSpreadsheet, onSelect: () => exportBalancesCsv('customers') },
              { label: t('rpt.exportSuppliersCsv'), icon: FileSpreadsheet, onSelect: () => exportBalancesCsv('suppliers') },
              {
                label: t('rpt.exportJson'),
                icon: FileJson,
                onSelect: () => {
                  if (!balances.data) return
                  downloadBlob(
                    new Blob([JSON.stringify(balances.data, null, 2)], { type: 'application/json' }),
                    `hamd-balances-${YMD()}.json`
                  )
                  toast.success(t('rpt.exportJson'))
                },
              },
              { label: t('rpt.exportPrint'), icon: Printer, onSelect: printBalances },
            ]}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          <PartySection
            kind="customer"
            rows={b.customers}
            title={t('rpt.receivablesTitle')}
            sub={t('rpt.receivablesSub')}
            empty={t('rpt.noDebtors')}
            emptyHint={t('rpt.noDebtorsHint')}
            chipLabel={t('rpt.totalReceivables')}
            total={b.totals.receivables}
            t={t}
            money={money}
          />
          <PartySection
            kind="supplier"
            rows={b.suppliers}
            title={t('rpt.payablesTitle')}
            sub={t('rpt.payablesSub')}
            empty={t('rpt.noCreditors')}
            emptyHint={t('rpt.noCreditorsHint')}
            chipLabel={t('rpt.totalPayables')}
            total={b.totals.payables}
            t={t}
            money={money}
          />
        </div>

        {/* Net position summary */}
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <ArrowDownLeft className="size-5 shrink-0 text-primary" aria-hidden />
            <span className="text-sm text-muted-foreground">{t('rpt.netPosition')}</span>
            <span className={`ms-auto text-lg font-bold num-ltr ${net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {money(net)}
            </span>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div>
      {header}

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="w-full justify-start overflow-x-auto scrollbar-thin sm:w-fit">
          <TabsTrigger value="overview" className="whitespace-nowrap">{t('rpt.tabOverview')}</TabsTrigger>
          <TabsTrigger value="products" className="whitespace-nowrap">{t('rpt.tabProducts')}</TabsTrigger>
          <TabsTrigger value="stock" className="whitespace-nowrap">{t('rpt.tabStock')}</TabsTrigger>
          <TabsTrigger value="balances" className="whitespace-nowrap">{t('rpt.tabBalances')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
            {rangeSelect}
            <div className="ms-auto">
              <ExportMenu
                label={t('rpt.exportMenu')}
                disabled={!charts.data}
                items={[
                  { label: t('rpt.exportExcel'), icon: Sheet, onSelect: () => exportExcel('overview') },
                  { label: t('rpt.exportPdf'), icon: FileDown, onSelect: pdfOverview },
                  { label: t('rpt.exportDailyCsv'), icon: FileSpreadsheet, onSelect: exportDailyCsv },
                  { label: t('rpt.exportJson'), icon: FileJson, onSelect: exportJson },
                  { label: t('rpt.exportPrint'), icon: Printer, onSelect: printOverview },
                ]}
              />
            </div>
          </div>
          {overviewBody}
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
            {rangeSelect}
            <div className="ms-auto">
              <ExportMenu
                label={t('rpt.exportMenu')}
                disabled={!charts.data}
                items={[
                  { label: t('rpt.exportExcel'), icon: Sheet, onSelect: () => exportExcel('products') },
                  { label: t('rpt.exportPdf'), icon: FileDown, onSelect: pdfProducts },
                  { label: t('rpt.exportProductsCsv'), icon: FileSpreadsheet, onSelect: exportProductsCsv },
                  { label: t('rpt.exportCategoriesCsv'), icon: FileSpreadsheet, onSelect: exportCategoriesCsv },
                  { label: t('rpt.exportPrint'), icon: Printer, onSelect: printProducts },
                ]}
              />
            </div>
          </div>
          {productsBody}
        </TabsContent>

        <TabsContent value="stock" className="space-y-4">
          {stockBody}
        </TabsContent>

        <TabsContent value="balances" className="space-y-4">
          {balancesBody}
        </TabsContent>
      </Tabs>
    </div>
  )
}
