'use client'

/**
 * Document-level report tabs — closes the gap reported by the user:
 * "لا يوجد تقارير للنقدية ولا حركة صنف ولا تقارير خزينة ولا تقارير مبيعات ولا مشتريات".
 *
 * FRONTEND-ONLY: every dataset comes from an EXISTING, already-secured API —
 *   - InvoiceDocReport   → GET /api/invoices?type=SALE|PURCHASE (date/status/page)
 *   - CashDocReport      → GET /api/vouchers (RECEIPT + PAYMENT) + GET /api/expenses
 *   - MovementsDocReport → GET /api/stock/movements (+ /api/products & /api/warehouses for filters)
 * Each tab owns its own filters, KPIs, table, pagination and exports
 * (CSV / print / PDF / JSON) so ReportsView stays a thin shell.
 */

import { useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ClipboardList,
  FileDown,
  FileJson,
  FileSpreadsheet,
  Landmark,
  Printer,
  ReceiptText,
  RefreshCw,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { StatCard } from '@/components/shared/stat-card'
import { useApi } from '@/hooks/use-api'
import { useI18n } from '@/lib/i18n'
import { useSession } from '@/stores/session'
import { downloadBlob, downloadCsv, printReport, YMD, type ReportPrintTable } from './chart-parts'
import { downloadReportPdf } from '@/lib/reports/report-pdf'

// ─────────────────────────── shared types & helpers ───────────────────────────

const DOC_PAGE_SIZE = 200 // server cap per request — pagination covers older docs
const MOV_LIMIT = 500 // /api/stock/movements hard cap

type NumStr = string | number

interface InvoiceRow {
  id: string
  number: number
  status: string
  date: string
  partyName: string | null
  warehouseName: string | null
  total: NumStr
  paidAmount: NumStr
  itemCount: number
}
interface InvoiceListResp {
  total: number
  page: number
  pageSize: number
  rows: InvoiceRow[]
}

interface VoucherRow {
  id: string
  number: number
  type: 'RECEIPT' | 'PAYMENT'
  method: string
  amount: NumStr
  partyName: string | null
  invoiceNumber: number | null
  note: string | null
  date: string
}
interface VoucherListResp {
  total: number
  page: number
  pageSize: number
  rows: VoucherRow[]
}

interface ExpenseRow {
  id: string
  category: string
  amount: NumStr
  method: string
  note: string | null
  date: string
}
interface ExpenseListResp {
  total: number
  page: number
  pageSize: number
  rows: ExpenseRow[]
}

interface MovRow {
  id: string
  productId: string
  productName: string
  barcode: string | null
  warehouseName: string
  qty: NumStr
  kind: string
  refType: string | null
  note: string | null
  createdAt: string
}
type MovListResp = MovRow[]

interface ProductLite {
  id: string
  name: string
}
interface ProductListResp {
  total: number
  rows: ProductLite[]
}
interface WarehouseLite {
  id: string
  name: string
}

/** Local-date yyyy-mm-dd (not UTC) so "today" matches the user's calendar. */
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
function todayYMD(): string {
  return ymd(new Date())
}
function daysAgoYMD(n: number): string {
  return ymd(new Date(Date.now() - n * 86_400_000))
}

const nOf = (v: NumStr | null | undefined): number => Number(v ?? 0) || 0

const KIND_IN = new Set(['PURCHASE', 'SALE_CANCEL', 'ADJUST_IN', 'TRANSFER_IN', 'OPENING'])
const MOV_KINDS = [
  'PURCHASE',
  'SALE',
  'SALE_CANCEL',
  'PURCHASE_CANCEL',
  'ADJUST_IN',
  'ADJUST_OUT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'OPENING',
] as const

/** Local copy of the shared export dropdown (ReportsView keeps its own). */
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
          <FileSpreadsheet className="size-4 me-2" aria-hidden />
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

interface DocModel {
  slug: string
  title: string
  rangeLabel: string
  kpis: Array<{ label: string; value: string }>
  tables: ReportPrintTable[]
}

/** Letterhead print + direct PDF with the org branding (same shell as ReportsView). */
function useReportDoc() {
  const { t, lang } = useI18n()
  const org = useSession((s) => s.org)
  const build = (m: DocModel) => ({
    title: m.title,
    subtitle: t('rpt.docSub'),
    brand: org?.name || 'H.A.M.D',
    logo: org?.logo ?? null,
    phone: org?.phone ?? null,
    address: org?.address ?? null,
    dir: (lang === 'ar' ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
    rangeLabel: m.rangeLabel,
    kpis: m.kpis,
    tables: m.tables,
  })
  const printDoc = (m: DocModel) => {
    const opened = printReport(build(m))
    if (!opened) toast.error(t('rpt.printBlocked'))
  }
  const pdfDoc = (m: DocModel) => {
    toast.promise(
      downloadReportPdf({ ...build(m), filename: `hamd-${m.slug}-${YMD()}.pdf` }),
      { loading: t('rpt.exporting'), success: t('rpt.exportPdfDone'), error: t('rpt.exportFailed') },
    )
  }
  return { printDoc, pdfDoc }
}

/** Date-range toolbar inputs (from = 29 days ago, to = today by default). */
function DateRangeInputs({
  from,
  to,
  onFrom,
  onTo,
  fromLabel,
  toLabel,
}: {
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  fromLabel: string
  toLabel: string
}) {
  return (
    <>
      <Input
        type="date"
        dir="ltr"
        className="num-ltr h-10 text-start text-xs md:h-9 md:w-36"
        aria-label={fromLabel}
        value={from}
        onChange={(e) => onFrom(e.target.value)}
      />
      <Input
        type="date"
        dir="ltr"
        className="num-ltr h-10 text-start text-xs md:h-9 md:w-36"
        aria-label={toLabel}
        value={to}
        onChange={(e) => onTo(e.target.value)}
      />
    </>
  )
}

/** Full-width load skeleton block matching the tab content height. */
function TabSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[86px] rounded-xl" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-[300px] rounded-xl" />
      ))}
    </div>
  )
}

/** Load-failure block with a combined retry action. */
function LoadFail({ title, onRetry, retryLabel }: { title: string; onRetry: () => void; retryLabel: string }) {
  return (
    <EmptyState
      icon={RefreshCw}
      title={title}
      action={
        <Button variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      }
    />
  )
}

// ─────────────────────────── sales / purchases report ───────────────────────────

const STATUS_TONE: Record<string, string> = {
  PAID: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  PARTIAL: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  CANCELLED: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  UNPAID: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
}

/**
 * Paginated invoice listing for one document type (SALE shown in the
 * "sales report" tab, PURCHASE in "purchases report"). KPI sums cover the
 * displayed page; when the period holds more documents an honest hint says so.
 */
export function InvoiceDocReport({ kind }: { kind: 'SALE' | 'PURCHASE' }) {
  const { t, money, num, date } = useI18n()
  const [from, setFrom] = useState(daysAgoYMD(29))
  const [to, setTo] = useState(todayYMD())
  const [status, setStatus] = useState('ALL')
  const [page, setPage] = useState(1)
  const { printDoc, pdfDoc } = useReportDoc()

  const qs = useMemo(() => {
    const p = new URLSearchParams({
      type: kind,
      from,
      to,
      page: String(page),
      pageSize: String(DOC_PAGE_SIZE),
    })
    if (status !== 'ALL') p.set('status', status)
    return p.toString()
  }, [kind, from, to, status, page])

  const docs = useApi<InvoiceListResp>(`/api/invoices?${qs}`)
  const rows = docs.data?.rows ?? []
  const total = docs.data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / DOC_PAGE_SIZE))

  // KPI sums over the fetched page (honest when the period holds more docs).
  const sumTotal = rows.reduce((a, r) => a + nOf(r.total), 0)
  const sumPaid = rows.reduce((a, r) => a + nOf(r.paidAmount), 0)
  const sumDue = rows.reduce((a, r) => a + nOf(r.total) - nOf(r.paidAmount), 0)
  const hidden = Math.max(0, total - rows.length)
  const sumsHint = t('rpt.sumsHint', { extra: hidden > 0 ? t('rpt.docCountExceeds', { n: num(hidden, 0) }) : '' })

  const resetPage = () => setPage(1)
  const resetAll = () => {
    setFrom(daysAgoYMD(29))
    setTo(todayYMD())
    setStatus('ALL')
    setPage(1)
  }

  const rangeLabel = `${t('common.from')} ${from} — ${t('common.to')} ${to}`
  const title = kind === 'SALE' ? t('rpt.docSalesTitle') : t('rpt.docPurchasesTitle')

  const tableRows = rows.map((r) => [
    String(r.number),
    date(r.date),
    r.partyName ?? '—',
    r.warehouseName ?? '—',
    num(r.itemCount, 0),
    money(nOf(r.total)),
    money(nOf(r.paidAmount)),
    money(nOf(r.total) - nOf(r.paidAmount)),
    t(`common.status.${r.status}`),
  ])

  const doc = (): DocModel => ({
    slug: kind === 'SALE' ? 'sales-report' : 'purchases-report',
    title,
    rangeLabel,
    kpis: [
      { label: t('rpt.kpiDocCount'), value: num(total, 0) },
      { label: t('rpt.kpiDocTotal'), value: money(sumTotal) },
      { label: t('rpt.kpiDocPaid'), value: money(sumPaid) },
      { label: t('rpt.kpiDocDue'), value: money(sumDue) },
    ],
    tables: [
      {
        title,
        headers: [
          t('rpt.colDocNo'),
          t('common.date'),
          kind === 'SALE' ? t('common.customer') : t('common.supplier'),
          t('rpt.colWarehouse'),
          t('rpt.colItems'),
          t('common.total'),
          t('common.paid'),
          t('common.remaining'),
          t('rpt.colDocStatus'),
        ],
        rows: tableRows,
      },
    ],
  })

  const exportCsv = () => {
    if (rows.length === 0) return
    downloadCsv(
      `hamd-${kind === 'SALE' ? 'sales' : 'purchases'}-report-${YMD()}.csv`,
      [
        t('rpt.colDocNo'),
        t('common.date'),
        kind === 'SALE' ? t('common.customer') : t('common.supplier'),
        t('rpt.colWarehouse'),
        t('rpt.colItems'),
        t('common.total'),
        t('common.paid'),
        t('common.remaining'),
        t('rpt.colDocStatus'),
      ],
      rows.map((r) => [
        r.number,
        r.date,
        r.partyName ?? '',
        r.warehouseName ?? '',
        r.itemCount,
        nOf(r.total),
        nOf(r.paidAmount),
        nOf(r.total) - nOf(r.paidAmount),
        t(`common.status.${r.status}`),
      ])
    )
    toast.success(t('rpt.exportCsv'))
  }

  const exportJson = () => {
    if (!docs.data) return
    downloadBlob(
      new Blob([JSON.stringify(docs.data, null, 2)], { type: 'application/json' }),
      `hamd-${kind === 'SALE' ? 'sales' : 'purchases'}-report-${YMD()}.json`
    )
    toast.success(t('rpt.exportJson'))
  }

  let body: React.ReactNode
  if (docs.error && !docs.data) {
    body = <LoadFail title={t('rpt.loadFail')} onRetry={docs.refetch} retryLabel={t('common.retry')} />
  } else if (docs.loading && !docs.data) {
    body = <TabSkeleton />
  } else if (rows.length === 0) {
    body = <EmptyState icon={ClipboardList} title={t('rpt.noDocs')} hint={t('rpt.noDocsHint')} />
  } else {
    body = (
      <>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label={t('rpt.kpiDocCount')} value={num(total, 0)} icon={ClipboardList} tone="default" />
          <StatCard label={t('rpt.kpiDocTotal')} value={money(sumTotal)} icon={TrendingUp} tone="success" />
          <StatCard label={t('rpt.kpiDocPaid')} value={money(sumPaid)} icon={Wallet} tone="info" />
          <StatCard label={t('rpt.kpiDocDue')} value={money(sumDue)} icon={ReceiptText} tone="warn" />
        </div>
        {hidden > 0 ? <p className="text-xs text-muted-foreground">{sumsHint}</p> : null}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-xs text-muted-foreground">{rangeLabel}</p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto rounded-lg border scrollbar-thin">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="whitespace-nowrap">{t('rpt.colDocNo')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('common.date')}</TableHead>
                    <TableHead className="whitespace-nowrap">
                      {kind === 'SALE' ? t('common.customer') : t('common.supplier')}
                    </TableHead>
                    <TableHead className="whitespace-nowrap">{t('rpt.colWarehouse')}</TableHead>
                    <TableHead className="whitespace-nowrap text-center">{t('rpt.colItems')}</TableHead>
                    <TableHead className="whitespace-nowrap text-end">{t('common.total')}</TableHead>
                    <TableHead className="whitespace-nowrap text-end">{t('common.paid')}</TableHead>
                    <TableHead className="whitespace-nowrap text-end">{t('common.remaining')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('rpt.colDocStatus')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const due = nOf(r.total) - nOf(r.paidAmount)
                    return (
                      <TableRow key={r.id} className={r.status === 'CANCELLED' ? 'opacity-60' : undefined}>
                        <TableCell className="num-ltr font-medium">#{r.number}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{date(r.date)}</TableCell>
                        <TableCell className="max-w-[180px] truncate">{r.partyName ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{r.warehouseName ?? '—'}</TableCell>
                        <TableCell className="num-ltr text-center">{num(r.itemCount, 0)}</TableCell>
                        <TableCell className="num-ltr whitespace-nowrap text-end font-medium">
                          {money(nOf(r.total))}
                        </TableCell>
                        <TableCell className="num-ltr whitespace-nowrap text-end">{money(nOf(r.paidAmount))}</TableCell>
                        <TableCell
                          className={`num-ltr whitespace-nowrap text-end ${due > 0 && r.status !== 'CANCELLED' ? 'font-medium text-rose-600 dark:text-rose-400' : ''}`}
                        >
                          {money(r.status === 'CANCELLED' ? 0 : due)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[r.status] ?? STATUS_TONE.UNPAID}`}
                          >
                            {t(`common.status.${r.status}`)}
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {lastPage > 1 ? (
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-xs text-muted-foreground">
                  {t('rpt.showingPage', {
                    a: num((page - 1) * DOC_PAGE_SIZE + 1, 0),
                    b: num((page - 1) * DOC_PAGE_SIZE + rows.length, 0),
                    c: num(total, 0),
                  })}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {t('rpt.prevPage')}
                  </Button>
                  <span className="num-ltr text-xs text-muted-foreground">
                    {num(page, 0)} / {num(lastPage, 0)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= lastPage}
                    onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                  >
                    {t('rpt.nextPage')}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <DateRangeInputs
          from={from}
          to={to}
          onFrom={(v) => {
            setFrom(v)
            resetPage()
          }}
          onTo={(v) => {
            setTo(v)
            resetPage()
          }}
          fromLabel={t('common.from')}
          toLabel={t('common.to')}
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v)
            resetPage()
          }}
        >
          <SelectTrigger size="sm" className="h-10 md:h-9 md:w-40" aria-label={t('rpt.colDocStatus')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('rpt.statusAll')}</SelectItem>
            {(['UNPAID', 'PARTIAL', 'PAID', 'CANCELLED'] as const).map((s) => (
              <SelectItem key={s} value={s}>
                {t(`common.status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" className="h-10 md:h-9" onClick={resetAll} aria-label={t('common.reset')}>
          <RefreshCw className="size-4" aria-hidden />
          {t('common.reset')}
        </Button>
        <div className="ms-auto">
          <ExportMenu
            label={t('rpt.exportMenu')}
            disabled={!docs.data}
            items={[
              { label: t('rpt.exportDocsCsv'), icon: FileSpreadsheet, onSelect: exportCsv },
              { label: t('rpt.exportPdf'), icon: FileDown, onSelect: () => pdfDoc(doc()) },
              { label: t('rpt.exportPrint'), icon: Printer, onSelect: () => printDoc(doc()) },
              { label: t('rpt.exportJson'), icon: FileJson, onSelect: exportJson },
            ]}
          />
        </div>
      </div>
      {body}
    </div>
  )
}

// ─────────────────────────── cash & treasury report ───────────────────────────

type CashKind = 'RECEIPT' | 'PAYMENT' | 'EXPENSE'

interface LedgerRow {
  id: string
  kind: CashKind
  number: number | null
  party: string
  method: string
  amount: number
  note: string | null
  invoiceNumber: number | null
  date: string
}

const CASH_KIND_TONE: Record<CashKind, string> = {
  RECEIPT: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  PAYMENT: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  EXPENSE: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
}

/**
 * Treasury view of one period: vouchers (RECEIPT = money in, PAYMENT = money
 * out) plus expenses merged into a single date-sorted ledger, KPI net cash and
 * a per-payment-method breakdown. All three feeds load in parallel.
 */
export function CashDocReport() {
  const { t, money, num, date } = useI18n()
  const [from, setFrom] = useState(daysAgoYMD(29))
  const [to, setTo] = useState(todayYMD())
  const { printDoc, pdfDoc } = useReportDoc()

  const period = `from=${from}&to=${to}&page=1&pageSize=${DOC_PAGE_SIZE}`
  const receipts = useApi<VoucherListResp>(`/api/vouchers?type=RECEIPT&${period}`)
  const payments = useApi<VoucherListResp>(`/api/vouchers?type=PAYMENT&${period}`)
  const expenses = useApi<ExpenseListResp>(`/api/expenses?${period}`)

  // Unified ledger — newest first (module-level helper keeps it pure).
  const ledger = useMemo<LedgerRow[]>(() => {
    const out: LedgerRow[] = []
    for (const v of receipts.data?.rows ?? []) {
      out.push({
        id: v.id,
        kind: 'RECEIPT',
        number: v.number,
        party: v.partyName ?? '—',
        method: v.method,
        amount: nOf(v.amount),
        note: v.note,
        invoiceNumber: v.invoiceNumber,
        date: v.date,
      })
    }
    for (const v of payments.data?.rows ?? []) {
      out.push({
        id: v.id,
        kind: 'PAYMENT',
        number: v.number,
        party: v.partyName ?? '—',
        method: v.method,
        amount: nOf(v.amount),
        note: v.note,
        invoiceNumber: v.invoiceNumber,
        date: v.date,
      })
    }
    for (const e of expenses.data?.rows ?? []) {
      out.push({
        id: e.id,
        kind: 'EXPENSE',
        number: null,
        party: e.category,
        method: e.method,
        amount: nOf(e.amount),
        note: e.note,
        invoiceNumber: null,
        date: e.date,
      })
    }
    return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [receipts.data, payments.data, expenses.data])

  const totalIn = ledger.filter((r) => r.kind === 'RECEIPT').reduce((a, r) => a + r.amount, 0)
  const totalOut = ledger.filter((r) => r.kind === 'PAYMENT').reduce((a, r) => a + r.amount, 0)
  const totalExp = ledger.filter((r) => r.kind === 'EXPENSE').reduce((a, r) => a + r.amount, 0)
  const net = totalIn - totalOut - totalExp

  // Honest sums: when any feed hit its 200-row cap, the period holds more docs.
  const hidden =
    Math.max(0, (receipts.data?.total ?? 0) - (receipts.data?.rows.length ?? 0)) +
    Math.max(0, (payments.data?.total ?? 0) - (payments.data?.rows.length ?? 0)) +
    Math.max(0, (expenses.data?.total ?? 0) - (expenses.data?.rows.length ?? 0))

  // Per-method in/out — unknown method strings get their own row on the fly.
  const byMethod = useMemo(() => {
    const m = new Map<string, { in: number; out: number }>()
    for (const r of ledger) {
      const e = m.get(r.method) ?? { in: 0, out: 0 }
      if (r.kind === 'RECEIPT') e.in += r.amount
      else e.out += r.amount
      m.set(r.method, e)
    }
    return Array.from(m.entries()).map(([method, v]) => ({ method, ...v }))
  }, [ledger])

  const methodLabel = (m: string) => {
    const key = `rpt.method${m}`
    const v = t(key)
    return v === key ? m : v // unknown method → show raw code
  }

  const kindLabel = (k: CashKind) =>
    k === 'RECEIPT' ? t('rpt.cashKindReceipt') : k === 'PAYMENT' ? t('rpt.cashKindPayment') : t('rpt.cashKindExpense')

  const rangeLabel = `${t('common.from')} ${from} — ${t('common.to')} ${to}`
  const resetAll = () => {
    setFrom(daysAgoYMD(29))
    setTo(todayYMD())
  }
  const refetchAll = () => {
    receipts.refetch()
    payments.refetch()
    expenses.refetch()
  }

  const doc = (): DocModel => ({
    slug: 'cash-treasury',
    title: t('rpt.cashTitle'),
    rangeLabel,
    kpis: [
      { label: t('rpt.kpiCashIn'), value: money(totalIn) },
      { label: t('rpt.kpiCashOut'), value: money(totalOut) },
      { label: t('rpt.kpiExpenses'), value: money(totalExp) },
      { label: t('rpt.kpiCashNet'), value: money(net) },
    ],
    tables: [
      {
        title: t('rpt.cashByMethod'),
        headers: [t('rpt.cashByMethod'), t('rpt.kpiCashIn'), t('rpt.kpiCashOut'), t('rpt.kpiCashNet')],
        rows: byMethod.map((m) => [methodLabel(m.method), money(m.in), money(m.out), money(m.in - m.out)]),
      },
      {
        title: t('rpt.cashLedger'),
        headers: [
          t('common.date'),
          t('rpt.colKind'),
          t('rpt.colDocNo'),
          t('rpt.colParty'),
          t('rpt.cashByMethod'),
          t('rpt.cashLedgerNote'),
          t('rpt.colEffect'),
        ],
        rows: ledger.map((r) => [
          date(r.date, true),
          kindLabel(r.kind),
          r.number != null ? `#${r.number}` : '—',
          r.party,
          methodLabel(r.method),
          r.note ?? (r.invoiceNumber != null ? `${t('rpt.cashDocRef')} #${r.invoiceNumber}` : '—'),
          (r.kind === 'RECEIPT' ? '+' : '−') + money(r.amount),
        ]),
      },
    ],
  })

  const exportCsv = () => {
    if (ledger.length === 0) return
    downloadCsv(
      `hamd-treasury-${YMD()}.csv`,
      [
        t('common.date'),
        t('rpt.colKind'),
        t('rpt.colDocNo'),
        t('rpt.colParty'),
        t('rpt.cashByMethod'),
        t('rpt.cashLedgerNote'),
        t('rpt.colEffect'),
      ],
      ledger.map((r) => [
        r.date,
        kindLabel(r.kind),
        r.number ?? '',
        r.party,
        methodLabel(r.method),
        r.note ?? (r.invoiceNumber != null ? `${t('rpt.cashDocRef')} #${r.invoiceNumber}` : ''),
        r.kind === 'RECEIPT' ? r.amount : -r.amount,
      ])
    )
    toast.success(t('rpt.exportCsv'))
  }

  const exportJson = () => {
    downloadBlob(
      new Blob(
        [
          JSON.stringify(
            {
              range: { from, to },
              totals: { in: totalIn, out: totalOut, expenses: totalExp, net },
              byMethod,
              receipts: receipts.data?.rows ?? [],
              payments: payments.data?.rows ?? [],
              expenses: expenses.data?.rows ?? [],
            },
            null,
            2
          ),
        ],
        { type: 'application/json' }
      ),
      `hamd-treasury-${YMD()}.json`
    )
    toast.success(t('rpt.exportJson'))
  }

  const anyData = !!(receipts.data || payments.data || expenses.data)
  const anyLoading = receipts.loading || payments.loading || expenses.loading
  const failed =
    (!receipts.data && !!receipts.error) ||
    (!payments.data && !!payments.error) ||
    (!expenses.data && !!expenses.error)

  let body: React.ReactNode
  if (failed) {
    body = <LoadFail title={t('rpt.loadFail')} onRetry={refetchAll} retryLabel={t('common.retry')} />
  } else if (anyLoading && !anyData) {
    body = <TabSkeleton />
  } else if (ledger.length === 0) {
    body = <EmptyState icon={Wallet} title={t('rpt.cashNoMoves')} hint={t('rpt.cashNoMovesHint')} />
  } else {
    body = (
      <>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label={t('rpt.kpiCashIn')} value={money(totalIn)} icon={ArrowDownLeft} tone="success" />
          <StatCard label={t('rpt.kpiCashOut')} value={money(totalOut)} icon={ArrowUpRight} tone="danger" />
          <StatCard label={t('rpt.kpiExpenses')} value={money(totalExp)} icon={ReceiptText} tone="warn" />
          <StatCard
            label={t('rpt.kpiCashNet')}
            value={money(net)}
            icon={Landmark}
            tone={net >= 0 ? 'info' : 'danger'}
          />
        </div>
        {hidden > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t('rpt.sumsHint', { extra: t('rpt.docCountExceeds', { n: num(hidden, 0) }) })}
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {/* per-method breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('rpt.cashByMethod')}</CardTitle>
              <p className="text-xs text-muted-foreground">{rangeLabel}</p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto rounded-lg border scrollbar-thin">
                <Table className="min-w-[420px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>{t('rpt.cashByMethod')}</TableHead>
                      <TableHead className="text-end">{t('rpt.kpiCashIn')}</TableHead>
                      <TableHead className="text-end">{t('rpt.kpiCashOut')}</TableHead>
                      <TableHead className="text-end">{t('rpt.kpiCashNet')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byMethod.map((m) => (
                      <TableRow key={m.method}>
                        <TableCell className="font-medium">{methodLabel(m.method)}</TableCell>
                        <TableCell className="num-ltr text-end text-emerald-700 dark:text-emerald-400">
                          {money(m.in)}
                        </TableCell>
                        <TableCell className="num-ltr text-end text-rose-700 dark:text-rose-400">
                          {money(m.out)}
                        </TableCell>
                        <TableCell className="num-ltr text-end font-medium">{money(m.in - m.out)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* ledger */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('rpt.cashLedger')}</CardTitle>
              <p className="text-xs text-muted-foreground">{t('rpt.cashLedgerHint', { n: num(ledger.length, 0) })}</p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[420px] overflow-auto rounded-lg border scrollbar-thin">
                <Table className="min-w-[560px]">
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="whitespace-nowrap">{t('common.date')}</TableHead>
                      <TableHead className="whitespace-nowrap">{t('rpt.colKind')}</TableHead>
                      <TableHead className="whitespace-nowrap">{t('rpt.colParty')}</TableHead>
                      <TableHead className="whitespace-nowrap">{t('rpt.cashByMethod')}</TableHead>
                      <TableHead className="whitespace-nowrap text-end">{t('rpt.colEffect')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">{date(r.date, true)}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${CASH_KIND_TONE[r.kind]}`}
                          >
                            {kindLabel(r.kind)}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate">
                          {r.party}
                          {r.number != null ? <span className="num-ltr block text-xs text-muted-foreground">#{r.number}</span> : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{methodLabel(r.method)}</TableCell>
                        <TableCell
                          className={`num-ltr whitespace-nowrap text-end font-medium ${
                            r.kind === 'RECEIPT' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {r.kind === 'RECEIPT' ? '+' : '−'}
                          {money(r.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <DateRangeInputs
          from={from}
          to={to}
          onFrom={setFrom}
          onTo={setTo}
          fromLabel={t('common.from')}
          toLabel={t('common.to')}
        />
        <Button variant="ghost" className="h-10 md:h-9" onClick={resetAll} aria-label={t('common.reset')}>
          <RefreshCw className="size-4" aria-hidden />
          {t('common.reset')}
        </Button>
        <div className="ms-auto">
          <ExportMenu
            label={t('rpt.exportMenu')}
            disabled={!anyData}
            items={[
              { label: t('rpt.exportCashCsv'), icon: FileSpreadsheet, onSelect: exportCsv },
              { label: t('rpt.exportPdf'), icon: FileDown, onSelect: () => pdfDoc(doc()) },
              { label: t('rpt.exportPrint'), icon: Printer, onSelect: () => printDoc(doc()) },
              { label: t('rpt.exportJson'), icon: FileJson, onSelect: exportJson },
            ]}
          />
        </div>
      </div>
      {body}
    </div>
  )
}

// ─────────────────────────── item movement report ───────────────────────────────────

const MOV_TONE_IN = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
const MOV_TONE_OUT = 'bg-rose-500/10 text-rose-700 dark:text-rose-300'

/**
 * Stock ledger: every StockMovement (sales out, purchases in, cancellations,
 * adjustments, transfers, openings) with product / warehouse / kind filters.
 * The API caps at 500 latest rows — the hint under the KPIs says so honestly.
 */
export function MovementsDocReport() {
  const { t, num, date } = useI18n()
  const [productId, setProductId] = useState('ALL')
  const [wh, setWh] = useState('ALL')
  const [kind, setKind] = useState('ALL')
  const { printDoc, pdfDoc } = useReportDoc()

  // Filter option feeds (small, cached by useApi).
  const products = useApi<ProductListResp>('/api/products?pageSize=200&active=1')
  const warehouses = useApi<WarehouseLite[]>('/api/warehouses')

  const qs = useMemo(() => {
    const p = new URLSearchParams({ limit: String(MOV_LIMIT) })
    if (productId !== 'ALL') p.set('productId', productId)
    if (wh !== 'ALL') p.set('warehouseId', wh)
    if (kind !== 'ALL') p.set('kind', kind)
    return p.toString()
  }, [productId, wh, kind])
  const movs = useApi<MovListResp>(`/api/stock/movements?${qs}`)
  const rows = movs.data ?? []

  const totalIn = rows.reduce((a, m) => a + Math.max(0, nOf(m.qty)), 0)
  const totalOut = rows.reduce((a, m) => a + Math.max(0, -nOf(m.qty)), 0)
  const net = totalIn - totalOut

  const kindLabel = (k: string) => {
    const v = t(`rpt.kind${k}`)
    return v === `rpt.kind${k}` ? k : v // unknown kind → raw code
  }
  const refNote = (m: MovRow) => m.note ?? (m.refType ?? '—')

  const rangeLabel = t('rpt.movShowing', { n: num(rows.length, 0) })
  const resetAll = () => {
    setProductId('ALL')
    setWh('ALL')
    setKind('ALL')
  }

  const doc = (): DocModel => ({
    slug: 'item-movements',
    title: t('rpt.movTitle'),
    rangeLabel,
    kpis: [
      { label: t('rpt.kpiMovIn'), value: num(totalIn, 3) },
      { label: t('rpt.kpiMovOut'), value: num(totalOut, 3) },
      { label: t('rpt.kpiMovNet'), value: num(net, 3) },
    ],
    tables: [
      {
        title: t('rpt.movTitle'),
        headers: [
          t('common.date'),
          t('rpt.colProduct'),
          t('rpt.colBarcode'),
          t('common.warehouse'),
          t('rpt.colKind'),
          t('common.qty'),
          t('rpt.colRefNote'),
        ],
        rows: rows.map((m) => [
          date(m.createdAt, true),
          m.productName,
          m.barcode ?? '—',
          m.warehouseName,
          kindLabel(m.kind),
          (nOf(m.qty) > 0 ? '+' : '') + num(nOf(m.qty), 3),
          refNote(m),
        ]),
      },
    ],
  })

  const exportCsv = () => {
    if (rows.length === 0) return
    downloadCsv(
      `hamd-item-movements-${YMD()}.csv`,
      [
        t('common.date'),
        t('rpt.colProduct'),
        t('rpt.colBarcode'),
        t('common.warehouse'),
        t('rpt.colKind'),
        t('common.qty'),
        t('rpt.colRefNote'),
      ],
      rows.map((m) => [
        m.createdAt,
        m.productName,
        m.barcode ?? '',
        m.warehouseName,
        kindLabel(m.kind),
        nOf(m.qty),
        refNote(m),
      ])
    )
    toast.success(t('rpt.exportCsv'))
  }

  const exportJson = () => {
    if (!movs.data) return
    downloadBlob(
      new Blob([JSON.stringify(movs.data, null, 2)], { type: 'application/json' }),
      `hamd-item-movements-${YMD()}.json`
    )
    toast.success(t('rpt.exportJson'))
  }

  let body: React.ReactNode
  if (movs.error && !movs.data) {
    body = <LoadFail title={t('rpt.loadFail')} onRetry={movs.refetch} retryLabel={t('common.retry')} />
  } else if (movs.loading && !movs.data) {
    body = <TabSkeleton />
  } else if (rows.length === 0) {
    body = <EmptyState icon={ClipboardList} title={t('rpt.movNoData')} hint={t('rpt.movNoDataHint')} />
  } else {
    body = (
      <>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label={t('rpt.kpiMovIn')} value={num(totalIn, 3)} icon={ArrowDownLeft} tone="success" sub={rangeLabel} />
          <StatCard label={t('rpt.kpiMovOut')} value={num(totalOut, 3)} icon={ArrowUpRight} tone="danger" sub={rangeLabel} />
          <StatCard
            label={t('rpt.kpiMovNet')}
            value={num(net, 3)}
            icon={Landmark}
            tone={net >= 0 ? 'info' : 'warn'}
            sub={rangeLabel}
          />
          <StatCard
            label={t('rpt.kpiDocCount')}
            value={num(rows.length, 0)}
            icon={ClipboardList}
            tone="default"
            sub={rangeLabel}
          />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('rpt.movTitle')}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('rpt.movSub')}</p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[560px] overflow-auto rounded-lg border scrollbar-thin">
              <Table className="min-w-[820px]">
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="whitespace-nowrap">{t('common.date')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('rpt.colProduct')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('rpt.colBarcode')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('common.warehouse')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('rpt.colKind')}</TableHead>
                    <TableHead className="whitespace-nowrap text-end">{t('common.qty')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('rpt.colRefNote')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((m) => {
                    const q = nOf(m.qty)
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap text-xs">{date(m.createdAt, true)}</TableCell>
                        <TableCell className="max-w-[200px] truncate font-medium">{m.productName}</TableCell>
                        <TableCell className="num-ltr whitespace-nowrap text-xs text-muted-foreground">
                          {m.barcode ?? '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{m.warehouseName}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                              m.kind === 'OPENING' ? 'bg-slate-500/10 text-slate-700 dark:text-slate-300' : KIND_IN.has(m.kind) ? MOV_TONE_IN : MOV_TONE_OUT
                            }`}
                          >
                            {kindLabel(m.kind)}
                          </span>
                        </TableCell>
                        <TableCell
                          className={`num-ltr whitespace-nowrap text-end font-bold ${
                            q > 0 ? 'text-emerald-600 dark:text-emerald-400' : q < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
                          }`}
                        >
                          {q > 0 ? '+' : ''}
                          {num(q, 3)}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={refNote(m)}>
                          {refNote(m)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        {/* product filter */}
        <Select
          value={productId}
          onValueChange={(v) => setProductId(v)}
        >
          <SelectTrigger size="sm" className="h-10 md:h-9 md:w-52" aria-label={t('rpt.colProduct')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('rpt.movProductAll')}</SelectItem>
            {(products.data?.rows ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* warehouse filter */}
        <Select value={wh} onValueChange={(v) => setWh(v)}>
          <SelectTrigger size="sm" className="h-10 md:h-9 md:w-44" aria-label={t('common.warehouse')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('rpt.movWhAll')}</SelectItem>
            {(warehouses.data ?? []).map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* kind filter */}
        <Select value={kind} onValueChange={(v) => setKind(v)}>
          <SelectTrigger size="sm" className="h-10 md:h-9 md:w-44" aria-label={t('rpt.colKind')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('rpt.movKindAll')}</SelectItem>
            {MOV_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {kindLabel(k)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="ghost" className="h-10 md:h-9" onClick={resetAll} aria-label={t('common.reset')}>
          <RefreshCw className="size-4" aria-hidden />
          {t('common.reset')}
        </Button>
        <div className="ms-auto">
          <ExportMenu
            label={t('rpt.exportMenu')}
            disabled={!movs.data}
            items={[
              { label: t('rpt.exportMovCsv'), icon: FileSpreadsheet, onSelect: exportCsv },
              { label: t('rpt.exportPdf'), icon: FileDown, onSelect: () => pdfDoc(doc()) },
              { label: t('rpt.exportPrint'), icon: Printer, onSelect: () => printDoc(doc()) },
              { label: t('rpt.exportJson'), icon: FileJson, onSelect: exportJson },
            ]}
          />
        </div>
      </div>
      {body}
    </div>
  )
}
