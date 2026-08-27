'use client'

/**
 * Sales invoices management — Task 3-a (PosSalesAgent).
 *
 * Stats strip · search/status/customer/date filters over GET /api/invoices?type=SALE ·
 * desktop table + mobile cards · InvoiceDetailSheet (payments, cancel, printing).
 * After a POS sale, POSView stores 'tijara-open-invoice'; we auto-open it once.
 */

import * as React from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  MapPin,
  PackageSearch,
  ReceiptText,
  RotateCcw,
  Search,
} from 'lucide-react'

import PageHeader from '@/components/shared/page-header'
import EmptyState from '@/components/shared/empty-state'
import StatusBadge from '@/components/shared/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useApi } from '@/hooks/use-api'
import { useI18n } from '@/lib/i18n'
import type { InvoiceListRow, InvoiceStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { round2Client } from '@/lib/format'
import { useSession } from '@/stores/session'
import { useUIStore } from '@/stores/ui'
import { fmtDoc, todayISO, InvoiceDetailSheet } from './invoice-parts'

// ---------------------------------------------------------------- shapes

interface InvoicesPage {
  total: number
  page: number
  pageSize?: number
  rows: InvoiceListRow[]
}

function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = React.useState<T>(value)
  React.useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return v
}

const ALL = '__ALL__'
const PAGE_SIZES = [10, 20, 50]
const EPS = 0.009

export default function SalesView() {
  const { t, money, num, date, dir } = useI18n()
  const user = useSession((s) => s.user)
  const staff = user?.role === 'ADMIN' || user?.role === 'MANAGER'
  const setView = useUIStore((s) => s.setView)

  // ---------------- filters ----------------
  const [q, setQ] = React.useState('')
  const dq = useDebounced(q, 350)
  const [status, setStatus] = React.useState('')
  const [customerId, setCustomerId] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [nonce, setNonce] = React.useState(0)

  function resetPage() {
    setPage(1)
  }

  function resetAll() {
    setQ('')
    setStatus('')
    setCustomerId('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  const customersApi = useApi<Array<{ id: string; name: string; phone: string | null }>>('/api/customers')

  // ---------------- list ----------------
  const listUrl = React.useMemo(() => {
    const p = new URLSearchParams({ type: 'SALE', page: String(page), pageSize: String(pageSize) })
    if (dq.trim()) p.set('q', dq.trim())
    if (status) p.set('status', status)
    if (customerId) p.set('customerId', customerId)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    p.set('_r', String(nonce))
    return `/api/invoices?${p.toString()}`
  }, [dq, status, customerId, from, to, page, pageSize, nonce])

  const list = useApi<InvoicesPage>(listUrl)
  const rows = list.data?.rows ?? []
  const totalRows = list.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))

  // clamp page when filtering shrinks results
  React.useEffect(() => {
    if (!list.data) return
    void Promise.resolve().then(() => {
      setPage((cur) => (cur > totalPages ? totalPages : cur))
    })
  }, [list.data, totalPages])

  // ---------------- stats ----------------
  const today = todayISO()
  const statsUrl = `/api/invoices?type=SALE&from=${today}&pageSize=200&_r=${nonce}`
  const stats = useApi<InvoicesPage>(statsUrl)
  const todaySum = React.useMemo(
    () => round2Client((stats.data?.rows ?? []).reduce((s, r) => s + r.total, 0)),
    [stats.data]
  )
  const todayCount = stats.data?.total ?? 0
  const pageSum = React.useMemo(
    () => round2Client(rows.reduce((s, r) => s + r.total, 0)),
    [rows]
  )
  const unsettledCount = rows.filter(
    (r) => (r.status === 'UNPAID' || r.status === 'PARTIAL') && round2Client(r.total - r.paidAmount) > EPS
  ).length

  // ---------------- detail sheet ----------------
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  function openSheet(id: string) {
    setDetailId(id)
    setSheetOpen(true)
  }

  // auto-open the invoice handed over by the POS success dialog
  React.useEffect(() => {
    let handedOver: string | null = null
    try {
      handedOver = sessionStorage.getItem('tijara-open-invoice')
      if (handedOver) sessionStorage.removeItem('tijara-open-invoice')
    } catch {}
    if (handedOver) {
      void Promise.resolve().then(() => {
        setDetailId(handedOver)
        setSheetOpen(true)
      })
    }
  }, [])

  function onRowKey(e: React.KeyboardEvent, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openSheet(id)
    }
  }

  // ---------------- render helpers ----------------
  const loading = list.loading && !list.data
  const failed = !!list.error && !list.data
  const StartIcon = dir === 'rtl' ? ChevronRight : ChevronLeft
  const EndIcon = dir === 'rtl' ? ChevronLeft : ChevronRight

  function remainingOf(r: InvoiceListRow): number {
    return round2Client(r.total - r.paidAmount)
  }

  return (
    <div>
      <PageHeader
        title={t('nav.sales')}
        subtitle={t('sales.subtitle')}
        icon={<ClipboardList className="size-5" aria-hidden />}
        actions={
          !staff ? (
            <Badge variant="secondary" className="gap-1 whitespace-normal text-start">
              <ReceiptText className="size-3 shrink-0" aria-hidden />
              {t('sales.readonlyHint')}
            </Badge>
          ) : undefined
        }
      />

      {/* ------------- stats strip ------------- */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden />
          <span>
            {t('sales.statToday')}{' '}
            {stats.loading && !stats.data ? (
              <Skeleton className="inline-block h-4 w-28 align-middle" />
            ) : (
              <>
                <b dir="ltr" className="num-ltr tabular-nums text-foreground">
                  {money(todaySum)}
                </b>{' '}
                · {t('sales.statTodayCount', { n: num(todayCount, 0) })}
              </>
            )}
          </span>
        </span>
        <span className="hidden sm:inline" aria-hidden>
          ·
        </span>
        <span>
          {t('sales.statPageTotal')}{' '}
          <b dir="ltr" className="num-ltr tabular-nums text-foreground">
            {money(pageSum)}
          </b>
        </span>
        <span className="hidden sm:inline" aria-hidden>
          ·
        </span>
        <span>
          {t('sales.statUnsettled')}:{' '}
          <b className={cn('tabular-nums', unsettledCount > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>
            {num(unsettledCount, 0)}
          </b>
        </span>
      </div>

      {/* ------------- filters bar ------------- */}
      <div className="sticky top-16 z-20 -mx-1 mb-3 rounded-lg border-b bg-background/90 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          {/* search */}
          <div className="relative min-w-0 flex-1 md:min-w-56">
            <Search
              className="pointer-events-none absolute top-1/2 start-2.5 z-10 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                resetPage()
              }}
              placeholder={t('sales.searchPh')}
              aria-label={t('sales.searchPh')}
              className="h-10 ps-8"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:flex md:flex-wrap md:items-center">
            {/* status */}
            <Select
              value={status || ALL}
              onValueChange={(v) => {
                setStatus(v === ALL ? '' : v)
                resetPage()
              }}
            >
              <SelectTrigger className="h-10 md:h-9 md:w-36" aria-label={t('common.status')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('sales.statusAll')}</SelectItem>
                {(['UNPAID', 'PARTIAL', 'PAID', 'CANCELLED'] as InvoiceStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`common.status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* customer */}
            <Select
              value={customerId || ALL}
              onValueChange={(v) => {
                setCustomerId(v === ALL ? '' : v)
                resetPage()
              }}
            >
              <SelectTrigger className="h-10 md:h-9 md:w-44" aria-label={t('common.customer')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('sales.customerAll')}</SelectItem>
                {(customersApi.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* dates */}
            <Input
              type="date"
              dir="ltr"
              className="num-ltr h-10 text-start text-xs md:h-9 md:w-32"
              aria-label={t('common.from')}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                resetPage()
              }}
            />
            <Input
              type="date"
              dir="ltr"
              className="num-ltr h-10 text-start text-xs md:h-9 md:w-32"
              aria-label={t('common.to')}
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                resetPage()
              }}
            />

            <Button variant="ghost" className="h-10 md:h-9 md:w-auto" onClick={resetAll}>
              <RotateCcw className="size-4" aria-hidden />
              {t('common.reset')}
            </Button>
          </div>
        </div>
      </div>

      {/* ------------- desktop table ------------- */}
      <div className="hidden overflow-x-auto rounded-xl border scrollbar-thin md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="whitespace-nowrap">{t('sales.colNumber')}</TableHead>
              <TableHead className="whitespace-nowrap">{t('common.date')}</TableHead>
              <TableHead className="whitespace-nowrap">{t('common.customer')}</TableHead>
              <TableHead className="whitespace-nowrap">{t('common.warehouse')}</TableHead>
              <TableHead className="whitespace-nowrap text-center">{t('sales.colItems')}</TableHead>
              <TableHead className="whitespace-nowrap text-end">{t('common.total')}</TableHead>
              <TableHead className="whitespace-nowrap">{t('common.status')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 7 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-9 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : rows.map((r) => {
                  const rem = remainingOf(r)
                  return (
                    <TableRow
                      key={r.id}
                      tabIndex={0}
                      aria-label={t('sales.openDetails', { n: r.number })}
                      onKeyDown={(e) => onRowKey(e, r.id)}
                      className="cursor-pointer"
                      onClick={() => openSheet(r.id)}
                    >
                      <TableCell className="whitespace-nowrap">
                        <span dir="ltr" className="num-ltr font-bold tabular-nums">
                          {fmtDoc('INV', r.number)}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {date(r.date, true)}
                      </TableCell>
                      <TableCell className="max-w-44 truncate" title={r.partyName ?? undefined}>
                        {r.partyName ?? (
                          <span className="text-muted-foreground italic">{t('common.walkIn')}</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-36 truncate text-xs text-muted-foreground">
                        {r.warehouseName ?? '-'}
                      </TableCell>
                      <TableCell dir="ltr" className="num-ltr whitespace-nowrap text-center tabular-nums">
                        {num(r.itemCount ?? 0, 0)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-end">
                        <span dir="ltr" className="num-ltr block font-bold tabular-nums">
                          {money(r.total)}
                        </span>
                        {rem > EPS && r.status !== 'CANCELLED' ? (
                          <span
                            dir="ltr"
                            className="num-ltr block text-[11px] tabular-nums text-destructive"
                          >
                            − {money(rem)} · {t('common.remaining')}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={t('sales.openDetails', { n: r.number })}
                          title={t('sales.openDetails', { n: r.number })}
                          onClick={() => openSheet(r.id)}
                        >
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
          </TableBody>
        </Table>

        {!loading && rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={PackageSearch}
              title={failed ? t('sales.loadError') : t('sales.empty')}
              hint={failed ? undefined : q || status || customerId || from || to ? t('sales.emptyHint') : undefined}
              action={
                failed ? (
                  <Button variant="outline" onClick={() => setNonce((n) => n + 1)}>
                    {t('common.retry')}
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setView('pos')}>
                    {t('sales.goToPos')}
                  </Button>
                )
              }
            />
          </div>
        ) : null}
      </div>

      {/* ------------- mobile cards ------------- */}
      <div className="space-y-2 md:hidden">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={`skm-${i}`} className="h-24 rounded-xl" />)
          : rows.map((r) => {
              const rem = remainingOf(r)
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openSheet(r.id)}
                  className="block w-full rounded-xl border bg-card p-3 text-start shadow-sm transition-colors hover:border-primary/50 active:bg-accent/40"
                  aria-label={t('sales.openDetails', { n: r.number })}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span dir="ltr" className="num-ltr font-bold tabular-nums">
                      {fmtDoc('INV', r.number)}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-1 truncate text-sm">{r.partyName ?? t('common.walkIn')}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    <span>{date(r.date, true)}</span>
                    {r.warehouseName ? (
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin className="size-3" aria-hidden />
                        {r.warehouseName}
                      </span>
                    ) : null}
                    <span>
                      {num(r.itemCount ?? 0, 0)} {t('common.items')}
                    </span>
                  </p>
                  <div className="mt-1.5 flex items-end justify-between gap-2">
                    <span dir="ltr" className="num-ltr text-base font-extrabold tabular-nums">
                      {money(r.total)}
                    </span>
                    {rem > EPS && r.status !== 'CANCELLED' ? (
                      <span dir="ltr" className="num-ltr text-xs font-semibold tabular-nums text-destructive">
                        − {money(rem)}
                      </span>
                    ) : (
                      <span dir="ltr" className="num-ltr text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                        {money(r.paidAmount)}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}

        {!loading && rows.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title={failed ? t('sales.loadError') : t('sales.empty')}
            hint={failed ? undefined : t('sales.emptyHint')}
            action={
              failed ? (
                <Button variant="outline" onClick={() => setNonce((n) => n + 1)}>
                  {t('common.retry')}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setView('pos')}>
                  {t('sales.goToPos')}
                </Button>
              )
            }
          />
        ) : null}
      </div>

      {/* ------------- pagination ------------- */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t('common.pageOf', { p: Math.min(page, totalPages), n: totalPages })}
        </p>
        <div className="flex items-center gap-1.5">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v))
              resetPage()
            }}
          >
            <SelectTrigger className="h-9 w-fit gap-1 text-xs" aria-label={t('common.rowsPerPage')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            aria-label={t('sales.prevPage')}
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <StartIcon className="size-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            aria-label={t('sales.nextPage')}
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <EndIcon className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {/* ------------- detail sheet ------------- */}
      <InvoiceDetailSheet
        invoiceId={detailId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onChanged={() => setNonce((n) => n + 1)}
      />
    </div>
  )
}
