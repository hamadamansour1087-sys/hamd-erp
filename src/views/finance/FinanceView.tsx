'use client'

/**
 * Finance hub — receipt vouchers · payment vouchers · expenses.
 * Three server-paginated tabs sharing consistent toolbars, stats, dialogs and pagination.
 */

import * as React from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarX2,
  Info,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  TrendingDown,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import EmptyState from '@/components/shared/empty-state'
import PageHeader from '@/components/shared/page-header'
import StatCard from '@/components/shared/stat-card'
import { MethodBadge } from '@/components/shared/status-badge'
import { useI18n } from '@/lib/i18n'
import { ApiError, requestJson, useApi } from '@/hooks/use-api'
import { useSession } from '@/stores/session'
import { cn } from '@/lib/utils'
import {
  BootShapeF,
  ConfirmDelete,
  DEFAULT_CATEGORIES,
  DateField,
  ExpenseFormDialog,
  ExpensesPageDTO,
  MoneyCell,
  Paginator,
  PartyLite,
  VoucherFormDialog,
  VoucherPageDTO,
  VoucherRowDTO,
  VoucherTable,
  docNo,
  round2,
  startOfMonthISO,
  useDebounced,
} from './finance-parts'

type TabKey = 'receipts' | 'payments' | 'expenses'

export default function FinanceView() {
  const { t } = useI18n()
  const user = useSession((s) => s.user)
  const staff = !!user && user.role !== 'CASHIER'

  const [tab, setTab] = React.useState<TabKey>('receipts')
  const boot = useApi<BootShapeF>('/api/bootstrap')

  const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
    { key: 'receipts', label: t('fin.tabReceipts'), icon: ArrowDownToLine },
    { key: 'payments', label: t('fin.tabPayments'), icon: ArrowUpFromLine },
    { key: 'expenses', label: t('fin.tabExpenses'), icon: TrendingDown },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl px-3 pb-16 pt-4 sm:px-5">
      <PageHeader title={t('nav.finance')} subtitle={t('fin.sub')} icon={<Wallet className="size-5" aria-hidden />} />

      {/* Mobile tab switcher */}
      <div className="mb-3 sm:hidden">
        <Select value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <SelectTrigger className="h-11 w-full" aria-label={t('nav.finance')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TABS.map((tb) => (
              <SelectItem key={tb.key} value={tb.key}>
                {tb.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="mb-4 hidden w-full max-w-lg sm:grid sm:grid-cols-3">
          {TABS.map((tb) => (
            <TabsTrigger key={tb.key} value={tb.key} className="gap-1.5">
              <tb.icon className="size-4" aria-hidden />
              <span className="truncate">{tb.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="receipts" className="mt-0">
          <VouchersTab kind="RECEIPT" parties={boot.data?.customers ?? []} staff={staff} />
        </TabsContent>
        <TabsContent value="payments" className="mt-0">
          <VouchersTab kind="PAYMENT" parties={boot.data?.suppliers ?? []} staff={staff} />
        </TabsContent>
        <TabsContent value="expenses" className="mt-0">
          <ExpensesTab staff={staff} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ════════════════════════════════════════════════════════════ shared bits

function SplitCard({
  cash,
  other,
  out,
  loading,
}: {
  cash: number
  other: number
  out?: boolean
  loading?: boolean
}) {
  const { t, money } = useI18n()
  return (
    <Card className="h-full py-3 shadow-sm md:py-4">
      <CardContent className="px-4">
        <p className="truncate text-xs text-muted-foreground md:text-sm">{out ? t('fin.splitOutTitle') : t('fin.splitInTitle')}</p>
        {loading ? (
          <div className="mt-2 space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5">
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="whitespace-nowrap border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300">
                {t('fin.splitCash')}
              </Badge>
              <TintedAmount value={cash} out={out} />
            </span>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="whitespace-nowrap">{t('fin.splitOther')}</Badge>
              <TintedAmount value={other} out={out} />
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TintedAmount({ value, out }: { value: number; out?: boolean }) {
  const { money } = useI18n()
  return (
    <span
      dir="ltr"
      className={cn(
        'num-ltr whitespace-nowrap text-sm font-semibold tabular-nums',
        out ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
      )}
    >
      {money(value)}
    </span>
  )
}

function SkeletonCard() {
  return (
    <Card className="h-full py-3 md:py-4">
      <CardContent className="space-y-2 px-4">
        <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  )
}

function hasAnyFilter(...vals: Array<string | false>): boolean {
  return vals.some((v) => typeof v === 'string' && v.trim().length > 0)
}

// ════════════════════════════════════════════════════════════ vouchers tab (RECEIPT|PAYMENT)

function VouchersTab({ kind, parties, staff }: { kind: 'RECEIPT' | 'PAYMENT'; parties: PartyLite[]; staff: boolean }) {
  const { t, money } = useI18n()
  const isRcv = kind === 'RECEIPT'
  const prefix = isRcv ? 'RCV' : 'PMT'

  // ---- filters & pagination --------------------------------------------------
  const [q, setQ] = React.useState('')
  const qd = useDebounced(q)
  const [partyId, setPartyId] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(25)

  React.useEffect(() => {
    void Promise.resolve().then(() => setPage(1))
  }, [qd, partyId, from, to])

  const listUrl = React.useMemo(() => {
    const p = new URLSearchParams({ type: kind, page: String(page), pageSize: String(pageSize) })
    if (qd.trim()) p.set('q', qd.trim())
    if (partyId) p.set(isRcv ? 'customerId' : 'supplierId', partyId)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return `/api/vouchers?${p.toString()}`
  }, [kind, isRcv, page, pageSize, qd, partyId, from, to])

  const list = useApi<VoucherPageDTO>(listUrl)

  // ---- this-month aggregates ---------------------------------------------------
  const monthUrl = `/api/vouchers?type=${kind}&from=${startOfMonthISO()}&pageSize=200`
  const monthly = useApi<VoucherPageDTO>(monthUrl)

  const { monthSum, monthCash, monthOther } = React.useMemo(() => {
    const rows = monthly.data?.rows ?? []
    let sum = 0
    let cash = 0
    let other = 0
    for (const r of rows) {
      sum += r.amount
      if (r.method === 'CASH') cash += r.amount
      else other += r.amount
    }
    return { monthSum: round2(sum), monthCash: round2(cash), monthOther: round2(other) }
  }, [monthly.data])

  // ---- mutations -----------------------------------------------------------------
  const [formOpen, setFormOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<VoucherRowDTO | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  function refresh() {
    list.refetch()
    monthly.refetch()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await requestJson(`/api/vouchers/${deleteTarget.id}`, { method: 'DELETE' })
      toast.success(t('fin.voucherDeleted'))
      setDeleteTarget(null)
      refresh()
    } catch (e) {
      const err = e as ApiError
      if (err.queued) toast.info(t('common.savedOffline'))
      else toast.error(t('common.error'))
    } finally {
      setDeleting(false)
    }
  }

  function resetFilters() {
    setQ('')
    setPartyId('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  const rows = list.data?.rows ?? []
  const stale = list.loading && !!list.data
  const showError = !!list.error && !list.data

  const addLabel = isRcv ? t('fin.addReceiptShort') : t('fin.addPaymentShort')

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {monthly.loading || !monthly.data ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <StatCard
              label={isRcv ? t('fin.statRcvMonth') : t('fin.statPayMonth')}
              value={money(monthSum)}
              sub={t('fin.monthHint')}
              icon={isRcv ? ArrowDownToLine : ArrowUpFromLine}
              tone={isRcv ? 'success' : 'danger'}
            />
            <StatCard
              label={isRcv ? t('fin.statRcvCount') : t('fin.statPayCount')}
              value={String(monthly.data.total)}
              sub={t('fin.monthHint')}
              icon={Wallet}
              tone={isRcv ? 'info' : 'warn'}
            />
            <SplitCard cash={monthCash} other={monthOther} out={!isRcv} loading={false} />
          </>
        )}
      </div>

      {/* Payables explanation tip (payments side) */}
      {!isRcv ? (
        <Alert className="border-muted bg-muted/40">
          <Info className="size-4 text-muted-foreground" aria-hidden />
          <AlertTitle>{t('fin.payablesTipTitle')}</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground">{t('fin.payablesTip')}</AlertDescription>
        </Alert>
      ) : null}

      {/* Toolbar */}
      <Card className="py-3">
        <CardContent className="flex flex-col gap-3 px-4 lg:flex-row lg:items-end">
          <div className="relative min-w-[10rem] flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('fin.searchPh')}
              className="h-11 ps-8 sm:h-9"
              aria-label={t('fin.searchPh')}
            />
          </div>

          <div className="grid gap-1.5 lg:w-52">
            <Label className="sr-only">{isRcv ? t('fin.partyCustomerAll') : t('fin.partySupplierAll')}</Label>
            <Select value={partyId || 'ALL'} onValueChange={(v) => setPartyId(v === 'ALL' ? '' : v)}>
              <SelectTrigger
                className="h-11 w-full sm:h-9"
                aria-label={isRcv ? t('fin.partyCustomerAll') : t('fin.partySupplierAll')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{isRcv ? t('fin.partyCustomerAll') : t('fin.partySupplierAll')}</SelectItem>
                {parties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DateField label={t('common.from')} value={from} onChange={setFrom} />
          <DateField label={t('common.to')} value={to} onChange={setTo} />

          <Button variant="ghost" size="sm" className="h-11 sm:h-9" onClick={resetFilters}>
            <RotateCcw className="me-1 size-4" aria-hidden />
            {t('fin.clearFilters')}
          </Button>

          {staff ? (
            <Button size="sm" className="ms-auto h-11 sm:h-9" onClick={() => setFormOpen(true)}>
              <Plus className="me-1 size-4" aria-hidden />
              {addLabel}
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
        ) : (
          <>
            <VoucherTable
              rows={rows}
              kind={kind}
              loading={list.loading}
              stale={stale}
              canDelete={staff}
              onRequestDelete={setDeleteTarget}
              emptyState={
                hasAnyFilter(qd, partyId, from, to) ? (
                  <EmptyState icon={Search} title={t('fin.noResults')} hint={t('fin.noResultsHint')} />
                ) : (
                  <EmptyState
                    icon={isRcv ? ArrowDownToLine : ArrowUpFromLine}
                    title={isRcv ? t('fin.emptyReceipts') : t('fin.emptyPayments')}
                    hint={isRcv ? t('fin.emptyReceiptsHint') : t('fin.emptyPaymentsHint')}
                    action={
                      staff ? (
                        <Button size="sm" onClick={() => setFormOpen(true)}>
                          <Plus className="me-1 size-4" aria-hidden />
                          {addLabel}
                        </Button>
                      ) : undefined
                    }
                  />
                )
              }
            />
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
      {formOpen ? (
        <VoucherFormDialog kind={kind} parties={parties} onClose={() => setFormOpen(false)} onCreated={refresh} />
      ) : null}

      <ConfirmDelete
        open={!!deleteTarget}
        title={deleteTarget ? t(isRcv ? 'fin.delRcvTitle' : 'fin.delPmtTitle') : ''}
        desc={
          deleteTarget
            ? `${docNo(prefix, deleteTarget.number)} · ${money(deleteTarget.amount)} — ${t('fin.voucherDelWarn')}`
            : ''
        }
        confirmLabel={t('common.delete')}
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════════ expenses tab

function ExpensesTab({ staff }: { staff: boolean }) {
  const { t, money, date, num } = useI18n()

  const [q, setQ] = React.useState('')
  const qd = useDebounced(q)
  const [category, setCategory] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(25)

  React.useEffect(() => {
    void Promise.resolve().then(() => setPage(1))
  }, [qd, category, from, to])

  const listUrl = React.useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (qd.trim()) p.set('q', qd.trim())
    if (category) p.set('q', category) // server searches OR(category,note); explicit category filter via same q keeps URL honest
    else if (qd.trim()) p.set('q', qd.trim())
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return `/api/expenses?${p.toString()}`
  }, [page, pageSize, qd, category, from, to])

  const list = useApi<ExpensesPageDTO>(listUrl)

  const monthUrl = `/api/expenses?from=${startOfMonthISO()}&pageSize=200`
  const monthly = useApi<ExpensesPageDTO>(monthUrl)

  const { monthSum, topCat } = React.useMemo(() => {
    const rows = monthly.data?.rows ?? []
    let sum = 0
    const byCat = new Map<string, number>()
    for (const r of rows) {
      sum += r.amount
      byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount)
    }
    let top: string | null = null
    let topVal = -1
    for (const [c, v] of byCat) {
      if (v > topVal) {
        topVal = v
        top = c
      }
    }
    return { monthSum: round2(sum), topCat: top }
  }, [monthly.data])

  const categories = React.useMemo(() => {
    const fromServer = list.data?.categories ?? []
    const set = new Set<string>([...DEFAULT_CATEGORIES, ...fromServer])
    return Array.from(set).sort()
  }, [list.data])

  const [formOpen, setFormOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; category: string; amount: number } | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  function refresh() {
    list.refetch()
    monthly.refetch()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await requestJson(`/api/expenses/${deleteTarget.id}`, { method: 'DELETE' })
      toast.success(t('fin.expenseDeleted'))
      setDeleteTarget(null)
      refresh()
    } catch (e) {
      const err = e as ApiError
      if (err.queued) toast.info(t('common.savedOffline'))
      else toast.error(t('common.error'))
    } finally {
      setDeleting(false)
    }
  }

  function resetFilters() {
    setQ('')
    setCategory('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  const rows = list.data?.rows ?? []
  const stale = list.loading && !!list.data
  const showError = !!list.error && !list.data

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {monthly.loading || !monthly.data ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <StatCard
              label={t('fin.statExpMonth')}
              value={money(monthSum)}
              sub={t('fin.monthHint')}
              icon={TrendingDown}
              tone="danger"
            />
            <StatCard
              label={t('fin.statTopCat')}
              value={topCat ?? t('fin.noCategoryYet')}
              icon={Wallet}
              tone="warn"
            />
            <StatCard
              label={t('fin.statRowsPage')}
              value={num(rows.length, 0)}
              sub={t('fin.pageRowsHint')}
              icon={ArrowDownToLine}
              tone="info"
            />
          </>
        )}
      </div>

      {/* Toolbar */}
      <Card className="py-3">
        <CardContent className="flex flex-col gap-3 px-4 lg:flex-row lg:items-end">
          <div className="relative min-w-[10rem] flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setCategory('')
              }}
              placeholder={t('fin.searchPh')}
              className="h-11 ps-8 sm:h-9"
              aria-label={t('fin.searchPh')}
            />
          </div>

          <div className="grid gap-1.5 lg:w-48">
            <Label className="sr-only">{t('fin.categoryAll')}</Label>
            <Select value={category || 'ALL'} onValueChange={(v) => { setCategory(v === 'ALL' ? '' : v); setQ('') }}>
              <SelectTrigger className="h-11 w-full sm:h-9" aria-label={t('fin.categoryAll')}>
                <SelectValue placeholder={t('fin.categoryAll')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('fin.categoryAll')}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DateField label={t('common.from')} value={from} onChange={setFrom} />
          <DateField label={t('common.to')} value={to} onChange={setTo} />

          <Button variant="ghost" size="sm" className="h-11 sm:h-9" onClick={resetFilters}>
            <RotateCcw className="me-1 size-4" aria-hidden />
            {t('fin.clearFilters')}
          </Button>

          {staff ? (
            <Button size="sm" className="ms-auto h-11 sm:h-9" onClick={() => setFormOpen(true)}>
              <Plus className="me-1 size-4" aria-hidden />
              {t('fin.expenseTitle')}
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
              <div key={i} className="h-11 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Wallet}
              title={hasAnyFilter(qd, category, from, to) ? t('fin.noResults') : t('fin.emptyExpenses')}
              hint={hasAnyFilter(qd, category, from, to) ? t('fin.noResultsHint') : t('fin.emptyExpensesHint')}
              action={
                staff ? (
                  <Button size="sm" onClick={() => setFormOpen(true)}>
                    <Plus className="me-1 size-4" aria-hidden />
                    {t('fin.expenseTitle')}
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className={cn(stale && 'opacity-60 transition-opacity')}>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto scrollbar-thin md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">{t('common.date')}</TableHead>
                    <TableHead className="text-start">{t('fin.colCategory')}</TableHead>
                    <TableHead className="text-end">{t('fin.colAmount')}</TableHead>
                    <TableHead className="text-start">{t('common.method')}</TableHead>
                    <TableHead className="text-start">{t('fin.colNote')}</TableHead>
                    {staff ? (
                      <TableHead className="w-12 text-end">
                        <span className="sr-only">{t('common.actions')}</span>
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{date(r.date)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="max-w-40 truncate">
                          {r.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end">
                        <MoneyCell value={r.amount} out />
                      </TableCell>
                      <TableCell>
                        <MethodBadge method={String(r.method)} />
                      </TableCell>
                      <TableCell className="max-w-44">
                        {r.note ? (
                          <span className="block truncate text-xs text-muted-foreground" title={r.note}>
                            {r.note}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {staff ? (
                        <TableCell className="text-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            aria-label={`${t('common.delete')} ${r.category}`}
                            onClick={() => setDeleteTarget({ id: r.id, category: r.category, amount: r.amount })}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-2 p-3 md:hidden">
              {rows.map((r) => (
                <Card key={r.id} className="py-3">
                  <CardContent className="space-y-2 px-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="secondary" className="max-w-36 truncate">
                        {r.category}
                      </Badge>
                      <MoneyCell value={r.amount} out />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{date(r.date, true)}</span>
                      <MethodBadge method={String(r.method)} />
                    </div>
                    {r.note ? (
                      <p className="truncate text-xs text-muted-foreground" title={r.note}>
                        {r.note}
                      </p>
                    ) : null}
                    {staff ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 w-full text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget({ id: r.id, category: r.category, amount: r.amount })}
                      >
                        <Trash2 className="me-1 size-4" aria-hidden />
                        {t('common.delete')}
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
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
          </div>
        )}
      </Card>

      {/* Dialogs */}
      {formOpen ? (
        <ExpenseFormDialog categories={categories} onClose={() => setFormOpen(false)} onCreated={refresh} />
      ) : null}

      <ConfirmDelete
        open={!!deleteTarget}
        title={deleteTarget ? t('fin.delExpTitle') : ''}
        desc={
          deleteTarget
            ? `${deleteTarget.category} · ${money(deleteTarget.amount)} — ${t('fin.delExpWarn')}`
            : ''
        }
        confirmLabel={t('common.delete')}
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
