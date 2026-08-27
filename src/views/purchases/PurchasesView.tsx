'use client'

/**
 * Purchases screen — purchase invoices list + stats, filters, creation wizard,
 * invoice detail viewer, per-invoice payment voucher and staff cancellation.
 */

import * as React from 'react'
import {
  Check,
  ChevronsUpDown,
  ClipboardList,
  CreditCard,
  Eye,
  Loader2,
  PackageOpen,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
  Truck,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
import { Textarea } from '@/components/ui/textarea'
import EmptyState from '@/components/shared/empty-state'
import PageHeader from '@/components/shared/page-header'
import StatCard from '@/components/shared/stat-card'
import StatusBadge, { MethodBadge } from '@/components/shared/status-badge'
import { useI18n } from '@/lib/i18n'
import { ApiError, requestJson, useApi } from '@/hooks/use-api'
import { useSession } from '@/stores/session'
import type { InvoiceDetail, InvoiceListRow } from '@/lib/types'
import { cn } from '@/lib/utils'
import { printDoc } from '@/lib/print/client'
import { ConfirmDelete, DateField, DocCode, Paginator, round2, todayISO, useDebounced } from '@/views/finance/finance-parts'

// ---------------------------------------------------------------- shapes

interface InvPage {
  total: number
  page: number
  pageSize: number
  rows: InvoiceListRow[]
}

interface BootShape {
  warehouses: Array<{ id: string; name: string; isDefault: boolean }>
  suppliers: Array<{ id: string; name: string; phone?: string | null }>
  products: Array<{ id: string; name: string; barcode: string | null; cost: number }>
}

interface CreatedResp {
  id: string
  number: number
  status: string
  total: number
  paidAmount: number
  warnings?: string[]
}

interface LineDraft {
  productId: string
  name: string
  barcode: string | null
  qty: string
  price: string
}

const NONE_SUPPLIER = '__none'

function pad4(n: number): string {
  return String(n).padStart(4, '0')
}
function docCode(n: number): string {
  return `PUR-${pad4(n)}`
}
function startOfMonthISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function parseNum(v: string): number {
  const n = parseFloat(String(v).replace(/,/g, '.'))
  return Number.isFinite(n) ? n : NaN
}
function clampMin0(n: number): number {
  return Number.isFinite(n) && n > 0 ? round2(n) : 0
}
function rankProducts<T extends { name: string; barcode: string | null }>(items: T[], term: string, limit = 8): T[] {
  const q = term.trim().toLowerCase()
  if (!q) return []
  const starts: T[] = []
  const contains: T[] = []
  for (const p of items) {
    if (p.name.toLowerCase().startsWith(q) || (p.barcode ?? '').toLowerCase().startsWith(q)) starts.push(p)
    else if (p.name.toLowerCase().includes(q) || (p.barcode ?? '').includes(q)) contains.push(p)
  }
  return [...starts, ...contains].slice(0, limit)
}

// ════════════════════════════════════════════════════════════ view root

export default function PurchasesView() {
  const { t, money, num, date } = useI18n()
  const user = useSession((s) => s.user)
  const staff = !!user && user.role !== 'CASHIER'

  const boot = useApi<BootShape>('/api/bootstrap')

  // ---- filters ----------------------------------------------------------------
  const [q, setQ] = React.useState('')
  const qd = useDebounced(q)
  const [status, setStatus] = React.useState('ALL')
  const [supplierFilter, setSupplierFilter] = React.useState('ALL')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(25)

  React.useEffect(() => {
    void Promise.resolve().then(() => setPage(1))
  }, [qd, status, supplierFilter, from, to])

  const listUrl = React.useMemo(() => {
    const p = new URLSearchParams({ type: 'PURCHASE', page: String(page), pageSize: String(pageSize) })
    if (qd.trim()) p.set('q', qd.trim())
    if (status !== 'ALL') p.set('status', status)
    if (supplierFilter !== 'ALL') p.set('supplierId', supplierFilter)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return `/api/invoices?${p.toString()}`
  }, [page, pageSize, qd, status, supplierFilter, from, to])

  const list = useApi<InvPage>(listUrl)

  // ---- this month aggregates ------------------------------------------------------
  const monthUrl = `/api/invoices?type=PURCHASE&from=${startOfMonthISO()}&pageSize=200`
  const monthly = useApi<InvPage>(monthUrl)

  const monthSum = React.useMemo(
    () =>
      round2(
        (monthly.data?.rows ?? [])
          .filter((r) => r.status !== 'CANCELLED')
          .reduce((s, r) => s + r.total, 0)
      ),
    [monthly.data]
  )
  const unpaidOnPage = React.useMemo(
    () =>
      round2(
        (list.data?.rows ?? [])
          .filter((r) => r.status === 'UNPAID' || r.status === 'PARTIAL')
          .reduce((s, r) => s + (r.total - r.paidAmount), 0)
      ),
    [list.data]
  )

  // ---- dialogs & post-create warnings -------------------------------------------------
  const [createOpen, setCreateOpen] = React.useState(false)
  const [payRow, setPayRow] = React.useState<InvoiceListRow | null>(null)
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = React.useState<InvoiceListRow | null>(null)
  const [cancelling, setCancelling] = React.useState(false)
  const [warnings, setWarnings] = React.useState<string[] | null>(null)

  function refreshAll() {
    list.refetch()
    monthly.refetch()
    boot.refetch()
  }

  async function confirmCancel() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await requestJson(`/api/invoices/${cancelTarget.id}`, { method: 'DELETE' })
      toast.success(t('purch.cancelledToast', { n: cancelTarget.number }))
      setCancelTarget(null)
      refreshAll()
    } catch (e) {
      const err = e as ApiError
      if (err.queued) {
        toast.info(t('common.savedOffline'))
        setCancelTarget(null)
        refreshAll()
      } else toast.error(err.message === 'already-cancelled' ? t('common.error') : t('common.error'))
    } finally {
      setCancelling(false)
    }
  }

  function resetFilters() {
    setQ('')
    setStatus('ALL')
    setSupplierFilter('ALL')
    setFrom('')
    setTo('')
    setPage(1)
  }

  const rows = list.data?.rows ?? []
  const stale = list.loading && !!list.data
  const showError = !!list.error && !list.data
  const hasFilters = !!(qd.trim() || status !== 'ALL' || supplierFilter !== 'ALL' || from || to)

  return (
    <div className="mx-auto w-full max-w-6xl px-3 pb-16 pt-4 sm:px-5">
      <PageHeader title={t('nav.purchases')} subtitle={t('purch.sub')} icon={<Truck className="size-5" aria-hidden />} />

      {/* Persistent warnings from last creation */}
      {warnings ? (
        <Alert className="relative mb-4 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
          <AlertTitle>{t('purch.warningsTitle')}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ps-5 text-xs">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 end-2 size-7"
            aria-label={t('common.close')}
            onClick={() => setWarnings(null)}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </Alert>
      ) : null}

      {/* Stats */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {!monthly.data ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <StatCard label={t('purch.statMonthTotal')} value={money(monthSum)} sub={t('purch.monthHint')} icon={Truck} tone="info" />
            <StatCard
              label={t('purch.statMonthCount')}
              value={num(monthly.data.total, 0)}
              sub={t('purch.monthHint')}
              icon={ClipboardList}
              tone="default"
            />
            <StatCard
              label={t('purch.statUnpaid')}
              value={money(unpaidOnPage)}
              sub={t('purch.scopePageHint')}
              icon={CreditCard}
              tone="danger"
            />
          </>
        )}
      </div>

      {/* Toolbar */}
      <Card className="py-3">
        <CardContent className="flex flex-col gap-3 px-4 lg:flex-row lg:items-end">
          <div className="relative min-w-[10rem] flex-1">
            <Search className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('purch.searchPh')}
              className="h-11 ps-8 sm:h-9"
              aria-label={t('purch.searchPh')}
            />
          </div>

          <div className="grid gap-1.5 lg:w-44">
            <Label className="sr-only">{t('purch.statusAll')}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-11 w-full sm:h-9" aria-label={t('purch.statusAll')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('purch.statusAll')}</SelectItem>
                {(['UNPAID', 'PARTIAL', 'PAID', 'CANCELLED'] as const).map((st) => (
                  <SelectItem key={st} value={st}>
                    {t(`common.status.${st}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5 lg:w-48">
            <Label className="sr-only">{t('purch.supplierAll')}</Label>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="h-11 w-full sm:h-9" aria-label={t('purch.supplierAll')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('purch.supplierAll')}</SelectItem>
                {(boot.data?.suppliers ?? []).map((sp) => (
                  <SelectItem key={sp.id} value={sp.id}>
                    {sp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DateField label={t('common.from')} value={from} onChange={setFrom} />
          <DateField label={t('common.to')} value={to} onChange={setTo} />

          <Button variant="ghost" size="sm" className="h-11 sm:h-9" onClick={resetFilters}>
            <RotateCcw className="me-1 size-4" aria-hidden />
            {t('common.reset')}
          </Button>

          {staff ? (
            <Button size="sm" className="ms-auto h-11 sm:h-9" onClick={() => setCreateOpen(true)}>
              <Plus className="me-1 size-4" aria-hidden />
              {t('purch.newInvoice')}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {/* List */}
      <Card className="overflow-hidden py-0">
        {showError ? (
          <div className="p-6">
            <EmptyState
              icon={TriangleAlert}
              title={t('common.error')}
              action={
                <Button variant="outline" size="sm" onClick={() => list.refetch()}>
                  {t('common.retry')}
                </Button>
              }
            />
          </div>
        ) : list.loading && rows.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={PackageOpen}
              title={hasFilters ? t('purch.noResults') : t('purch.empty')}
              hint={hasFilters ? t('purch.noResultsHint') : t('purch.emptyHint')}
              action={
                staff && !hasFilters ? (
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="me-1 size-4" aria-hidden />
                    {t('purch.newInvoice')}
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className={cn('hidden overflow-x-auto scrollbar-thin md:block', stale && 'opacity-60 transition-opacity')}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">{t('purch.colNo')}</TableHead>
                    <TableHead className="text-start">{t('common.date')}</TableHead>
                    <TableHead className="text-start">{t('purch.colSupplier')}</TableHead>
                    <TableHead className="text-start">{t('purch.colWarehouse')}</TableHead>
                    <TableHead className="text-center">{t('purch.colItems')}</TableHead>
                    <TableHead className="text-end">{t('purch.colTotal')}</TableHead>
                    <TableHead className="text-end">{t('purch.colPaid')}</TableHead>
                    <TableHead className="text-end">{t('purch.colRemain')}</TableHead>
                    <TableHead className="text-start">{t('purch.colStatus')}</TableHead>
                    <TableHead className="w-28 text-end">
                      <span className="sr-only">{t('common.actions')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const rem = round2(r.total - r.paidAmount)
                    const cancelled = r.status === 'CANCELLED'
                    return (
                      <TableRow
                        key={r.id}
                        tabIndex={0}
                        role="button"
                        aria-label={t('purch.viewAria', { n: pad4(r.number) })}
                        className={cn('cursor-pointer', cancelled && 'opacity-70')}
                        onClick={() => setDetailId(r.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setDetailId(r.id)
                          }
                        }}
                      >
                        <TableCell>
                          <DocCode>{docCode(r.number)}</DocCode>
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{date(r.date, true)}</TableCell>
                        <TableCell className="max-w-40 truncate font-medium" title={r.partyName ?? undefined}>
                          {r.partyName ?? t('purch.cashSupplierRow')}
                        </TableCell>
                        <TableCell className="max-w-32 truncate text-muted-foreground">{r.warehouseName ?? '—'}</TableCell>
                        <TableCell className="text-center text-muted-foreground">{r.itemCount ?? 0}</TableCell>
                        <TableCell className="font-bold whitespace-nowrap">{money(r.total)}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{money(r.paidAmount)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {rem > 0.009 ? (
                            <span dir="ltr" className="num-ltr font-semibold tabular-nums text-red-600 dark:text-red-400">
                              {money(rem)}
                            </span>
                          ) : (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400">✓</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell className="text-end" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={t('purch.viewAria', { n: pad4(r.number) })}
                              title={t('common.view')}
                              onClick={() => setDetailId(r.id)}
                            >
                              <Eye className="size-4" aria-hidden />
                            </Button>
                            {staff && !cancelled && rem > 0.009 ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-emerald-700 hover:text-emerald-700 dark:text-emerald-400"
                                aria-label={t('purch.payAria', { n: pad4(r.number) })}
                                title={t('purch.payAria', { n: pad4(r.number) })}
                                onClick={() => setPayRow(r)}
                              >
                                <ReceiptText className="size-4" aria-hidden />
                              </Button>
                            ) : null}
                            {staff && !cancelled ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-destructive hover:text-destructive"
                                aria-label={t('purch.cancelAria', { n: pad4(r.number) })}
                                title={t('purch.cancelAria', { n: pad4(r.number) })}
                                onClick={() => setCancelTarget(r)}
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className={cn('space-y-2 p-3 md:hidden', stale && 'opacity-60 transition-opacity')}>
              {rows.map((r) => {
                const rem = round2(r.total - r.paidAmount)
                const cancelled = r.status === 'CANCELLED'
                return (
                  <Card key={r.id} className={cn('py-3', cancelled && 'opacity-70')}>
                    <CardContent className="space-y-2 px-3">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 text-start"
                        onClick={() => setDetailId(r.id)}
                        aria-label={t('purch.viewAria', { n: pad4(r.number) })}
                      >
                        <DocCode>{docCode(r.number)}</DocCode>
                        <StatusBadge status={r.status} />
                      </button>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="num-ltr font-bold tabular-nums">{money(r.total)}</span>
                        {rem > 0.009 ? (
                          <span dir="ltr" className="num-ltr text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
                            {money(rem)}
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">✓</span>
                        )}
                      </div>
                      <p className="truncate text-sm font-medium">{r.partyName ?? t('purch.cashSupplierRow')}</p>
                      <p className="text-xs text-muted-foreground">
                        {date(r.date, true)} · {r.warehouseName ?? '—'} · {r.itemCount ?? 0} {t('common.items')}
                      </p>
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <Button variant="outline" size="sm" className="h-9" onClick={() => setDetailId(r.id)}>
                          <Eye className="me-1 size-4" aria-hidden />
                          {t('common.view')}
                        </Button>
                        {staff && !cancelled && rem > 0.009 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 text-emerald-700 dark:text-emerald-400"
                            onClick={() => setPayRow(r)}
                          >
                            <ReceiptText className="me-1 size-4" aria-hidden />
                            {t('purch.payChip')}
                          </Button>
                        ) : (
                          <span />
                        )}
                        {staff && !cancelled ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 text-destructive hover:text-destructive"
                            onClick={() => setCancelTarget(r)}
                          >
                            <Trash2 className="me-1 size-4" aria-hidden />
                            {t('purch.cancelChip')}
                          </Button>
                        ) : (
                          <span />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            <Paginator
              page={page}
              pageSize={pageSize}
              total={list.data?.total ?? 0}
              onPage={setPage}
              onPageSize={(s) => {
                setPageSize(s)
                setPage(1)
              }}
            />
          </>
        )}
      </Card>

      {/* Dialogs */}
      {createOpen ? (
        <CreatePurchaseDialog
          boot={boot.data}
          bootRefetch={boot.refetch}
          onClose={() => setCreateOpen(false)}
          onCreated={(warns) => {
            if (warns.length > 0) setWarnings(warns)
            refreshAll()
          }}
        />
      ) : null}

      {payRow ? (
        <PayDialog
          row={payRow}
          onClose={() => setPayRow(null)}
          onDone={() => {
            list.refetch()
            monthly.refetch()
          }}
        />
      ) : null}

      {detailId ? <DetailDialog id={detailId} onClose={() => setDetailId(null)} /> : null}

      <ConfirmDelete
        open={!!cancelTarget}
        title={cancelTarget ? `${t('purch.cancelTitle')} (${docCode(cancelTarget.number)})` : ''}
        desc={
          cancelTarget
            ? t('purch.cancelWarn', { wh: cancelTarget.warehouseName ?? t('common.allWarehouses') })
            : ''
        }
        confirmLabel={t('purch.cancelConfirm')}
        loading={cancelling}
        onCancel={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
      />
    </div>
  )
}

function StatSkeleton() {
  return (
    <Card className="h-full py-3 md:py-4">
      <CardContent className="space-y-2 px-4">
        <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════ create dialog

function CreatePurchaseDialog({
  boot,
  bootRefetch,
  onClose,
  onCreated,
}: {
  boot?: BootShape
  bootRefetch: () => void
  onClose: () => void
  onCreated: (warnings: string[]) => void
}) {
  const { t, money, num } = useI18n()

  // summary inputs (declared before the derived totals that depend on them)
  const [discStr, setDiscStr] = React.useState('')
  const [taxStr, setTaxStr] = React.useState(() => String(useSession.getState().org?.taxPercent ?? 14))

  // header selections
  const [supVal, setSupVal] = React.useState(NONE_SUPPLIER)
  const [supOpen, setSupOpen] = React.useState(false)
  const [addedSuppliers, setAddedSuppliers] = React.useState<Array<{ id: string; name: string; phone?: string | null }>>([])
  const [quickAdd, setQuickAdd] = React.useState(false)
  const [qaName, setQaName] = React.useState('')
  const [qaPhone, setQaPhone] = React.useState('')
  const [qaSaving, setQaSaving] = React.useState(false)

  const warehouses = boot?.warehouses ?? []
  const defaultWh = warehouses.find((w) => w.isDefault)
  const [whPick, setWhPick] = React.useState('')
  const effectiveWh = whPick || defaultWh?.id || warehouses[0]?.id || ''

  // line items
  const [lines, setLines] = React.useState<LineDraft[]>([])
  const products = React.useMemo(() => [...(boot?.products ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [boot])

  const [prodTerm, setProdTerm] = React.useState('')
  const [prodOpen, setProdOpen] = React.useState(false)
  const prodWrapRef = React.useRef<HTMLDivElement>(null)
  const prodResults = React.useMemo(() => rankProducts(products, prodTerm), [products, prodTerm])

  React.useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!prodWrapRef.current?.contains(e.target as Node)) setProdOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])

  function addLine(p: { id: string; name: string; barcode: string | null; cost: number }) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === p.id)
      if (i >= 0) {
        const next = [...prev]
        next[i] = { ...next[i], qty: String((parseNum(next[i].qty) || 0) + 1) }
        return next
      }
      return [...prev, { productId: p.id, name: p.name, barcode: p.barcode, qty: '1', price: String(p.cost) }]
    })
    setProdTerm('')
    setProdOpen(false)
  }

  function setLine(productId: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)))
  }

  // totals — mirror of server math
  const subtotal = React.useMemo(
    () => round2(lines.reduce((s, l) => s + Math.max(0, parseNum(l.qty) || 0) * Math.max(0, parseNum(l.price) || 0), 0)),
    [lines]
  )
  const discVal = clampMin0(parseNum(discStr))
  const pct = Math.max(0, parseNum(taxStr) || 0)
  const taxAmt = round2(((subtotal - discVal) * pct) / 100)
  const total = round2(subtotal - discVal + taxAmt)

  // payment inputs
  const [paidFull, setPaidFull] = React.useState(true)
  const [paidInput, setPaidInput] = React.useState('')
  const paidEff = paidFull ? total : Math.min(clampMin0(parseNum(paidInput)), total)
  const remainingAfter = round2(total - paidEff)

  const [method, setMethod] = React.useState<'CASH' | 'BANK' | 'CARD' | 'WALLET'>('CASH')
  const [dueDate, setDueDate] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const selectedSupplier =
    supVal === NONE_SUPPLIER ? null : addedSuppliers.find((s) => s.id === supVal) ?? boot?.suppliers.find((s) => s.id === supVal) ?? null

  async function quickAddSupplier() {
    if (!qaName.trim()) {
      toast.error(t('purch.quickAddNeedName'))
      return
    }
    setQaSaving(true)
    try {
      const sp = await requestJson<{ id: string; name: string; phone?: string | null }>('/api/suppliers', {
        method: 'POST',
        body: JSON.stringify({ name: qaName.trim(), phone: qaPhone.trim() || undefined }),
      })
      setAddedSuppliers((prev) => [...prev.filter((x) => x.id !== sp.id), sp])
      setSupVal(sp.id)
      toast.success(t('purch.supplierAdded'))
      setQuickAdd(false)
      setQaName('')
      setQaPhone('')
      setSupOpen(false)
      bootRefetch()
    } catch (e) {
      const err = e as ApiError
      if (err.queued) toast.info(t('common.savedOffline'))
      else toast.error(t('common.error'))
    } finally {
      setQaSaving(false)
    }
  }

  async function submit() {
    if (lines.length === 0) {
      toast.error(t('purch.needItem'))
      return
    }
    const badLine = lines.some((l) => !(parseNum(l.qty) > 0) || !(parseNum(l.price) >= 0))
    if (badLine) {
      toast.error(t('purch.badLine'))
      return
    }
    if (!effectiveWh) {
      toast.error(t('common.error'))
      return
    }
    setSaving(true)
    try {
      const res = await requestJson<CreatedResp>('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          type: 'PURCHASE',
          supplierId: supVal === NONE_SUPPLIER ? undefined : supVal,
          warehouseId: effectiveWh,
          items: lines.map((l) => ({ productId: l.productId, qty: parseNum(l.qty), price: parseNum(l.price) })),
          discount: discVal || undefined,
          taxPercent: pct,
          notes: notes.trim() || undefined,
          dueDate: dueDate || undefined,
          paidAmount: paidEff > 0 ? paidEff : undefined,
          paidMethod: method,
        }),
      })
      toast.success(t('purch.created', { n: res.number }))
      onCreated(res.warnings ?? [])
      onClose()
    } catch (e) {
      const err = e as ApiError
      if (err.queued) {
        toast.info(t('common.savedOffline'))
        onCreated([])
        onClose()
      } else if (err.message.includes('item')) {
        toast.error(t('purch.needItem'))
      } else {
        toast.error(t('common.error'))
      }
    } finally {
      setSaving(false)
    }
  }

  const supplierMerged = React.useMemo(() => {
    const base = boot?.suppliers ?? []
    const extra = addedSuppliers.filter((a) => !base.some((b) => b.id === a.id))
    return [...base, ...extra]
  }, [boot, addedSuppliers])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto scrollbar-thin sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="size-5 text-primary" aria-hidden />
            {t('purch.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('purch.createDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Header selections */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>{t('purch.supplierLabel')}</Label>
              <Popover open={supOpen} onOpenChange={setSupOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={supOpen} className="h-10 w-full justify-between font-normal">
                    <span className="truncate">
                      {selectedSupplier
                        ? selectedSupplier.name
                        : supVal === NONE_SUPPLIER
                          ? t('purch.noSupplier')
                          : t('purch.pickSupplier')}
                    </span>
                    <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" aria-hidden />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[22rem] p-0">
                  <Command>
                    <CommandInput placeholder={t('purch.searchPh')} />
                    <CommandList>
                      <CommandEmpty>{t('purch.noProductsFound')}</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="__none-supplier" onSelect={() => { setSupVal(NONE_SUPPLIER); setSupOpen(false) }}>
                          <Check className={cn('me-2 size-4', supVal === NONE_SUPPLIER ? 'opacity-100' : 'opacity-0')} aria-hidden />
                          {t('purch.noSupplier')}
                        </CommandItem>
                        {supplierMerged.map((sp) => (
                          <CommandItem key={sp.id} value={`${sp.name}`} onSelect={() => { setSupVal(sp.id); setSupOpen(false) }}>
                            <Check className={cn('me-2 size-4', supVal === sp.id ? 'opacity-100' : 'opacity-0')} aria-hidden />
                            <span className="truncate">{sp.name}</span>
                            {sp.phone ? (
                              <span dir="ltr" className="num-ltr ms-auto font-mono text-xs text-muted-foreground">
                                {sp.phone}
                              </span>
                            ) : null}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                    <div className="border-t p-2">
                      {quickAdd ? (
                        <div className="space-y-2">
                          <Input
                            autoFocus
                            value={qaName}
                            onChange={(e) => setQaName(e.target.value)}
                            placeholder={t('purch.quickAddNamePh')}
                            aria-label={t('purch.quickAddNamePh')}
                          />
                          <Input
                            dir="ltr"
                            inputMode="tel"
                            value={qaPhone}
                            onChange={(e) => setQaPhone(e.target.value)}
                            placeholder={t('purch.quickAddPhonePh')}
                            aria-label={t('purch.quickAddPhonePh')}
                            className="num-ltr text-start"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" className="h-9 flex-1" onClick={quickAddSupplier} disabled={qaSaving}>
                              {qaSaving ? <Loader2 className="me-1 size-4 animate-spin" aria-hidden /> : <Plus className="me-1 size-4" aria-hidden />}
                              {t('purch.quickAddSave')}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-9" onClick={() => setQuickAdd(false)}>
                              {t('common.cancel')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-9 w-full" onClick={() => setQuickAdd(true)}>
                          <Plus className="me-1 size-4" aria-hidden />
                          {t('purch.quickAddBtn')}
                        </Button>
                      )}
                    </div>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="pur-wh">{t('purch.warehouseLabel')}</Label>
              <Select value={effectiveWh || '__wait'} onValueChange={setWhPick}>
                <SelectTrigger id="pur-wh" className="h-10 w-full">
                  <SelectValue placeholder={effectiveWh ? undefined : t('common.loading')} />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                      {w.isDefault ? ' ★' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Items builder */}
          <section className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{t('purch.itemsTitle')}</h3>
              <span className="text-xs text-muted-foreground">{t('purch.costPrefillHint')}</span>
            </div>

            <div ref={prodWrapRef} className="relative">
              <Search className="pointer-events-none absolute top-1/2 start-2.5 z-10 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={prodTerm}
                onChange={(e) => {
                  setProdTerm(e.target.value)
                  setProdOpen(true)
                }}
                onFocus={() => setProdOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setProdOpen(false)
                  if (e.key === 'Enter' && prodResults[0]) {
                    e.preventDefault()
                    addLine(prodResults[0])
                  }
                }}
                placeholder={t('purch.productSearchPh')}
                className="ps-8"
                autoComplete="off"
                aria-label={t('purch.productSearchPh')}
              />
              {prodOpen && prodTerm.trim() ? (
                <div className="absolute inset-x-0 z-20 mt-1 max-h-56 overflow-auto scrollbar-thin rounded-md border bg-popover shadow-md">
                  {prodResults.length === 0 ? (
                    <p className="px-3 py-3 text-center text-sm text-muted-foreground">{t('purch.noProductsFound')}</p>
                  ) : (
                    <ul role="listbox">
                      {prodResults.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              addLine(p)
                            }}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-accent"
                          >
                            <span className="truncate font-medium">{p.name}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              {p.barcode ? (
                                <span dir="ltr" className="num-ltr font-mono text-xs text-muted-foreground">
                                  {p.barcode}
                                </span>
                              ) : null}
                              <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{money(p.cost)}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>

            {lines.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">{t('purch.productSearchPh')}</p>
            ) : (
              <div className="space-y-1.5">
                {/* header row */}
                <div className="hidden gap-2 px-1 text-xs text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_5rem_7rem_7rem_2.25rem]">
                  <span>{t('purch.itemsHeadName')}</span>
                  <span className="text-center">{t('purch.lineQty')}</span>
                  <span className="text-center">{t('purch.lineCost')}</span>
                  <span className="text-center">{t('purch.lineTotal')}</span>
                  <span />
                </div>
                {lines.map((l) => {
                  const lt = round2(Math.max(0, parseNum(l.qty) || 0) * Math.max(0, parseNum(l.price) || 0))
                  return (
                    <div
                      key={l.productId}
                      className="grid items-center gap-2 rounded-md bg-muted/40 p-2 md:grid-cols-[minmax(0,1fr)_5rem_7rem_7rem_2.25rem] md:bg-transparent md:p-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{l.name}</p>
                        {l.barcode ? (
                          <span dir="ltr" className="num-ltr font-mono text-[11px] text-muted-foreground">
                            {l.barcode}
                          </span>
                        ) : null}
                      </div>
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        aria-label={`${t('purch.lineQty')} ${l.name}`}
                        className="num-ltr mx-auto h-9 max-w-24 text-center md:max-w-none"
                        value={l.qty}
                        onChange={(e) => setLine(l.productId, { qty: e.target.value })}
                        autoComplete="off"
                      />
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        aria-label={`${t('purch.lineCost')} ${l.name}`}
                        className="num-ltr mx-auto h-9 max-w-28 text-center md:max-w-none"
                        value={l.price}
                        onChange={(e) => setLine(l.productId, { price: e.target.value })}
                        autoComplete="off"
                      />
                      <span className="num-ltr text-center text-sm font-semibold tabular-nums">{money(lt)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mx-auto size-8 text-destructive hover:text-destructive"
                        aria-label={t('purch.removeItem', { name: l.name })}
                        onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    </div>
                  )
                })}

                <div className="flex items-center justify-between border-t pt-2 text-sm">
                  <span className="text-muted-foreground">{t('common.subtotal')}</span>
                  <span className="num-ltr font-bold tabular-nums">{money(subtotal)}</span>
                </div>
              </div>
            )}
          </section>

          {/* Discount / tax / totals */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pur-disc">{t('purch.discountLabel')}</Label>
              <Input
                id="pur-disc"
                dir="ltr"
                inputMode="decimal"
                className="num-ltr text-start"
                value={discStr}
                onChange={(e) => setDiscStr(e.target.value)}
                placeholder="0"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pur-tax">{t('purch.taxLabel')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="pur-tax"
                  dir="ltr"
                  inputMode="decimal"
                  className="num-ltr h-9 w-20 text-center"
                  value={taxStr}
                  onChange={(e) => setTaxStr(e.target.value)}
                  autoComplete="off"
                />
                <span className="text-sm text-muted-foreground">% · {t('purch.taxPreview')}:</span>
                <span className="num-ltr font-semibold tabular-nums">{money(taxAmt)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/5 px-3 py-2.5">
            <span className="font-semibold">{t('purch.grandTotal')}</span>
            <span className="num-ltr text-xl font-bold tabular-nums text-primary">{money(total)}</span>
          </div>

          {/* Payment section */}
          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="text-sm font-semibold">{t('purch.paymentTitle')}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant={paidFull ? 'default' : 'outline'} className="h-9" onClick={() => setPaidFull(true)}>
                {t('purch.fullPaidChip')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!paidFull ? 'default' : 'outline'}
                className="h-9"
                onClick={() => {
                  setPaidFull(false)
                  setPaidInput('')
                }}
              >
                {t('purch.creditChip')}
              </Button>
              {remainingAfter > 0.009 && !paidFull ? (
                <span className="text-xs text-red-600 dark:text-red-400">
                  {t('common.remaining')}: <span className="num-ltr font-semibold">{money(remainingAfter)}</span>
                </span>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pur-paid">{t('purch.paidAmountLabel')}</Label>
                <Input
                  id="pur-paid"
                  dir="ltr"
                  inputMode="decimal"
                  readOnly={paidFull}
                  className="num-ltr text-start"
                  value={paidFull ? String(total) : paidInput}
                  onChange={(e) => setPaidInput(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pur-method">{t('common.method')}</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                  <SelectTrigger id="pur-method" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['CASH', 'BANK', 'CARD', 'WALLET'] as const).map((m) => (
                      <SelectItem key={m} value={m}>
                        {t(`common.method.${m}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pur-due">{t('purch.dueDateLabel')}</Label>
                <Input
                  id="pur-due"
                  type="date"
                  dir="ltr"
                  className="text-start"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pur-notes">{t('common.notes')}</Label>
              <Textarea id="pur-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="me-1 size-4 animate-spin" aria-hidden /> : <Truck className="me-1 size-4" aria-hidden />}
            {saving ? t('common.saving') : t('purch.createSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ════════════════════════════════════════════════════════════ detail dialog

function DetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, money, num, date } = useI18n()
  const d = useApi<InvoiceDetail>(`/api/invoices/${id}`)
  const data = d.data

  const remaining = data ? round2(data.total - data.paidAmount) : 0

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto scrollbar-thin sm:max-w-2xl">
        {!data ? (
          <>
            {/* loading state keeps an accessible title present while fetching */}
            <DialogHeader>
              <DialogTitle>{t('common.loading')}</DialogTitle>
              <DialogDescription>{t('purch.colNo')} · PUR</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Skeleton className="h-7 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <DocCode className="text-base">{docCode(data.number)}</DocCode>
                <StatusBadge status={data.status} />
              </DialogTitle>
              <DialogDescription>
                {date(data.date, true)}
                {data.warehouseName ? ` · ${data.warehouseName}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              {/* Party meta */}
              <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t('purch.colSupplier')}</p>
                  <p className="truncate font-medium">{data.partyName ?? t('purch.cashSupplierRow')}</p>
                  {data.supplierPhone ? (
                    <a href={`tel:${data.supplierPhone}`} dir="ltr" className="num-ltr text-xs text-muted-foreground underline-offset-2 hover:underline">
                      {data.supplierPhone}
                    </a>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('purch.colWarehouse')}</p>
                  <p className="font-medium">{data.warehouseName ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('common.createdBy')}</p>
                  <p className="truncate font-medium">{data.createdBy ?? '—'}</p>
                </div>
              </div>

              {/* Items */}
              <div className="overflow-x-auto scrollbar-thin rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-start">{t('purch.itemsHeadName')}</TableHead>
                      <TableHead className="text-center">{t('purch.lineQty')}</TableHead>
                      <TableHead className="text-end">{t('purch.lineCost')}</TableHead>
                      <TableHead className="text-end">{t('purch.lineTotal')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="max-w-52">
                          <p className="truncate font-medium">{it.nameSnap}</p>
                          {it.barcodeSnap ? (
                            <span dir="ltr" className="num-ltr font-mono text-[11px] text-muted-foreground">
                              {it.barcodeSnap}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="num-ltr text-center tabular-nums">{num(it.qty)}</TableCell>
                        <TableCell className="num-ltr text-end tabular-nums">{money(it.price)}</TableCell>
                        <TableCell className="num-ltr text-end font-semibold tabular-nums">{money(it.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="ms-auto w-full max-w-xs space-y-1 text-sm">
                <Row label={t('common.subtotal')} value={money(data.subtotal)} />
                {data.discount > 0.009 ? <Row label={t('common.discount')} value={`− ${money(data.discount)}`} tone="down" /> : null}
                {data.taxAmount > 0.009 ? (
                  <Row label={`${t('common.tax')} (${num(data.taxPercent, 2)}%)`} value={money(data.taxAmount)} />
                ) : null}
                <div className="my-1 border-t" />
                <Row label={t('purch.grandTotal')} value={money(data.total)} strong />
                <Row label={t('common.paid')} value={money(data.paidAmount)} />
                <Row label={t('common.remaining')} value={money(remaining)} tone={remaining > 0.009 ? 'danger' : 'ok'} strong />
                {data.notes ? (
                  <p className="pt-1 text-xs text-muted-foreground">
                    {t('common.notes')}: {data.notes}
                  </p>
                ) : null}
              </div>

              {/* Linked vouchers */}
              <section className="rounded-lg border p-3">
                <h4 className="mb-2 text-sm font-semibold">{t('purch.linkedVouchers')}</h4>
                {(data.vouchers ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">{t('purch.noVouchers')}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {(data.vouchers ?? []).map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <DocCode>{`PMT-${pad4(v.number)}`}</DocCode>
                        <span className="num-ltr font-semibold tabular-nums">{money(v.amount)}</span>
                        <StatusBadgeBadgeless method={v.method} />
                        <span className="text-xs text-muted-foreground">{date(v.date)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void printDoc('invoice', data.id, { paper: '80mm' })}>
                  <Printer className="me-1 size-4" aria-hidden />
                  {t('purch.print80')}
                </Button>
                <Button variant="outline" onClick={() => void printDoc('invoice', data.id, { paper: 'A4' })}>
                  <Printer className="me-1 size-4" aria-hidden />
                  {t('purch.printA4')}
                </Button>
              </div>
              <Button variant="secondary" onClick={onClose}>
                {t('common.close')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Row({
  label,
  value,
  tone,
  strong,
}: {
  label: string
  value: string
  tone?: 'down' | 'danger' | 'ok'
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        dir="ltr"
        className={cn(
          'num-ltr tabular-nums',
          strong && 'font-bold',
          tone === 'danger' && 'font-semibold text-red-600 dark:text-red-400',
          tone === 'ok' && 'font-semibold text-emerald-600 dark:text-emerald-400',
          tone === 'down' && 'text-red-600/90 dark:text-red-400/90'
        )}
      >
        {value}
      </span>
    </div>
  )
}

/** Method pill inside the detail voucher list (shared badge) */
function StatusBadgeBadgeless({ method }: { method: string }) {
  return <MethodBadge method={method} />
}

// ════════════════════════════════════════════════════════════ pay dialog

function PayDialog({
  row,
  onClose,
  onDone,
}: {
  row: InvoiceListRow
  onClose: () => void
  onDone: () => void
}) {
  const { t, money } = useI18n()
  const remaining = round2(row.total - row.paidAmount)
  const [amountStr, setAmountStr] = React.useState(() => String(remaining))
  const [method, setMethod] = React.useState<'CASH' | 'BANK' | 'CARD' | 'WALLET'>('CASH')
  const [note, setNote] = React.useState('')
  const [dateStr, setDateStr] = React.useState(todayISO())
  const [saving, setSaving] = React.useState(false)

  async function submit() {
    const amount = clampMin0(parseNum(amountStr))
    if (!(amount > 0)) {
      toast.error(t('fin.errAmount'))
      return
    }
    setSaving(true)
    try {
      const v = await requestJson<{ id: string; number: number }>('/api/vouchers', {
        method: 'POST',
        body: JSON.stringify({
          type: 'PAYMENT',
          amount,
          method,
          invoiceId: row.id,
          partyName: row.partyName ?? undefined,
          note: note.trim() || undefined,
          date: dateStr ? new Date(`${dateStr}T09:00:00`).toISOString() : undefined,
        }),
      })
      toast.success(t('purch.payDone', { n: v.number }))
      onDone()
      onClose()
    } catch (e) {
      const err = e as ApiError
      if (err.queued) {
        toast.info(t('common.savedOffline'))
        onDone()
        onClose()
      } else if (err.message === 'amount-required') {
        toast.error(t('fin.errAmount'))
      } else {
        toast.error(t('common.error'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="size-5 text-primary" aria-hidden />
            {t('purch.payTitle')}
          </DialogTitle>
          <DialogDescription>
            <DocCode>{docCode(row.number)}</DocCode> — {t('purch.payDesc')}
          </DialogDescription>
        </DialogHeader>

        {remaining <= 0.009 ? (
          <Alert className="border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40">
            <AlertTitle className="text-sm">{t('purch.payAlreadyDone')}</AlertTitle>
            <AlertDescription className="num-ltr text-xs">{money(row.paidAmount)}</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4 py-1">
            <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t('purch.payRemainingInfo')}</span>
              <span className="num-ltr font-bold text-red-600 tabular-nums dark:text-red-400">{money(remaining)}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="pay-amt">{t('fin.amountLabel')} *</Label>
                <Input
                  id="pay-amt"
                  dir="ltr"
                  inputMode="decimal"
                  className="num-ltr text-start"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pay-method">{t('common.method')}</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                  <SelectTrigger id="pay-method" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['CASH', 'BANK', 'CARD', 'WALLET'] as const).map((m) => (
                      <SelectItem key={m} value={m}>
                        {t(`common.method.${m}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="pay-date">{t('fin.dateLabel')}</Label>
              <Input id="pay-date" type="date" dir="ltr" className="text-start" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t('fin.dateEmptyHint')}</p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="pay-note">{t('common.notes')}</Label>
              <Textarea id="pay-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('fin.notePh')} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {remaining > 0.009 ? (
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="me-1 size-4 animate-spin" aria-hidden /> : <ReceiptText className="me-1 size-4" aria-hidden />}
              {saving ? t('common.saving') : t('purch.savePaymentShort')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
