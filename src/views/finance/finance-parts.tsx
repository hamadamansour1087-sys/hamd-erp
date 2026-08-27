'use client'

/**
 * Shared building blocks for the Finance hub (receipts / payments / expenses).
 * Used ONLY by src/views/finance/FinanceView.tsx (same task owner).
 */

import * as React from 'react'
import { ArrowLeft, ArrowRight, BadgeCheck, Banknote, CalendarX2, Loader2, Printer, ReceiptText, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { MethodBadge } from '@/components/shared/status-badge'
import { useI18n } from '@/lib/i18n'
import { ApiError, requestJson, useApi } from '@/hooks/use-api'
import type { PayMethod } from '@/lib/types'
import { cn } from '@/lib/utils'
import { printDoc } from '@/lib/print/client'

// ---------------------------------------------------------------- DTOs

export interface VoucherRowDTO {
  id: string
  number: number
  type: 'RECEIPT' | 'PAYMENT'
  method: PayMethod | string
  amount: number
  partyType: 'CUSTOMER' | 'SUPPLIER' | 'OTHER' | string
  partyName: string | null
  customerId: string | null
  supplierId: string | null
  invoiceId: string | null
  invoiceNumber: number | null
  note: string | null
  date: string
}

export interface VoucherPageDTO {
  total: number
  page: number
  pageSize: number
  rows: VoucherRowDTO[]
}

export interface ExpensesPageDTO {
  total: number
  page: number
  pageSize: number
  categories: string[]
  rows: Array<{
    id: string
    category: string
    amount: number
    method: PayMethod | string
    note: string | null
    date: string
  }>
}

export interface PartyLite {
  id: string
  name: string
}

/** Slimmed bootstrap shape — only what the Finance hub consumes. */
export interface BootShapeF {
  customers: PartyLite[]
  suppliers: PartyLite[]
}

interface BalancesShape {
  customers: Array<{ id: string; owed: number }>
  suppliers: Array<{ id: string; owed: number }>
  totals: { receivables: number; payables: number }
}

// ---------------------------------------------------------------- pure helpers

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function startOfMonthISO(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`
}

/** PUR-0042 style document code. */
export function docNo(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, '0')}`
}

export function parseAmount(v: string): number {
  const n = parseFloat(String(v).replace(/,/g, '.'))
  return Number.isFinite(n) && n > 0 ? round2(n) : 0
}

/** Debounce any fast-changing value (search inputs). */
export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = React.useState<T>(value)
  React.useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return v
}

// Default datalist categories for expenses (per product spec, seeded values are Arabic).
export const DEFAULT_CATEGORIES = ['إيجار', 'كهرباء', 'مياه', 'رواتب', 'صيانة', 'نثريات']

const METHODS: PayMethod[] = ['CASH', 'BANK', 'CARD', 'WALLET']

// ---------------------------------------------------------------- tiny presentational pieces

export function DocCode({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={cn('num-ltr whitespace-nowrap font-mono text-xs font-semibold', className)}>
      {children}
    </span>
  )
}

export function PartyTypeChip({ pt }: { pt: string }) {
  const { t } = useI18n()
  const tone =
    pt === 'CUSTOMER'
      ? 'border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
      : pt === 'SUPPLIER'
        ? 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
        : ''
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', tone)}>
      {t(`fin.partyType.${pt}`)}
    </Badge>
  )
}

export function LinkedInvoiceCell({ n }: { n: number | null }) {
  const { t } = useI18n()
  if (!n) {
    return <span className="text-xs text-muted-foreground italic">{t('fin.standalone')}</span>
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5">
      <ReceiptText className="size-3 text-muted-foreground" aria-hidden />
      <DocCode className="text-[11px]">{docNo('INV', n)}</DocCode>
    </span>
  )
}

/** Tinted money — emerald for money-in, red tint for money-out. */
export function MoneyCell({ value, out }: { value: number; out?: boolean }) {
  const { money } = useI18n()
  return (
    <span
      className={cn(
        'num-ltr inline-block rounded-md px-1.5 py-0.5 font-bold whitespace-nowrap tabular-nums',
        out ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      )}
    >
      {money(value)}
    </span>
  )
}

/** Consistent pagination footer used by every tab & list. */
export function Paginator({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
  onPageSize: (s: number) => void
}) {
  const { t } = useI18n()
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1
  const endRow = Math.min(total, page * pageSize)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label={t('common.back')}
        >
          <ArrowRight className="size-4 rtl:hidden" aria-hidden />
          <ArrowLeft className="size-4 ltr:hidden" aria-hidden />
        </Button>
        <span className="min-w-24 px-1 text-center text-xs text-muted-foreground">
          {t('common.pageOf', { p: page, n: pages })}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label={t('common.view')}
        >
          <ArrowLeft className="size-4 rtl:hidden" aria-hidden />
          <ArrowRight className="size-4 ltr:hidden" aria-hidden />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <span dir="ltr" className="num-ltr hidden text-xs text-muted-foreground sm:inline">
          {startRow}–{endRow} / {total}
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">{t('common.rowsPerPage')}</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger size="sm" className="w-20" aria-label={t('common.rowsPerPage')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50].map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function MethodSelectField({
  value,
  onChange,
  label,
}: {
  value: PayMethod
  onChange: (m: PayMethod) => void
  label: string
}) {
  const { t } = useI18n()
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as PayMethod)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t('common.select')} />
        </SelectTrigger>
        <SelectContent>
          {METHODS.map((m) => (
            <SelectItem key={m} value={m}>
              {t(`common.method.${m}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** LTR date input with an inline clear button — used across toolbars & dialogs. */
export function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="grid gap-1.5 lg:w-40">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">
        <Input
          type="date"
          dir="ltr"
          aria-label={label}
          className="h-11 text-start sm:h-9"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value ? (
          <Button variant="ghost" size="icon" className="size-9 shrink-0" aria-label={t('common.reset')} onClick={() => onChange('')}>
            <CalendarX2 className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** Generic destructive confirmation shared by vouchers / expenses deletions. */
export function ConfirmDelete({
  open,
  title,
  desc,
  confirmLabel,
  onCancel,
  onConfirm,
  loading,
}: {
  open: boolean
  title: string
  desc: string
  confirmLabel: string
  loading?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useI18n()
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{desc}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            disabled={loading}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {loading ? <Loader2 className="me-1 size-4 animate-spin" aria-hidden /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ---------------------------------------------------------------- vouchers table (both kinds)

export function VoucherTable({
  rows,
  kind,
  loading,
  stale,
  canDelete,
  onRequestDelete,
  emptyState,
}: {
  rows: VoucherRowDTO[]
  kind: 'RECEIPT' | 'PAYMENT'
  loading: boolean
  stale?: boolean
  canDelete: boolean
  onRequestDelete: (row: VoucherRowDTO) => void
  emptyState: React.ReactNode
}) {
  const { t, date } = useI18n()

  if (loading && rows.length === 0) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    )
  }
  if (rows.length === 0) return <div className="p-4">{emptyState}</div>

  const prefix = kind === 'RECEIPT' ? 'RCV' : 'PMT'

  return (
    <div className={cn(stale && 'opacity-60 transition-opacity')}>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto scrollbar-thin md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{t('fin.colNo')}</TableHead>
              <TableHead className="text-start">{t('common.date')}</TableHead>
              <TableHead className="text-start">{t('fin.colParty')}</TableHead>
              <TableHead className="text-start">{t('fin.colInvoice')}</TableHead>
              <TableHead className="text-end">{t('fin.colAmount')}</TableHead>
              <TableHead className="text-start">{t('common.method')}</TableHead>
              <TableHead className="text-start">{t('fin.colNote')}</TableHead>
              {canDelete ? (
                <TableHead className="w-12 text-end">
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <DocCode>{docNo(prefix, r.number)}</DocCode>
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">{date(r.date, true)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="max-w-44 truncate font-medium" title={r.partyName ?? undefined}>
                      {r.partyName ?? '—'}
                    </span>
                    <PartyTypeChip pt={r.partyType} />
                  </div>
                </TableCell>
                <TableCell>
                  <LinkedInvoiceCell n={r.invoiceNumber ?? null} />
                </TableCell>
                <TableCell className="text-end">
                  <MoneyCell value={r.amount} out={kind === 'PAYMENT'} />
                </TableCell>
                <TableCell>
                  <MethodBadge method={String(r.method)} />
                </TableCell>
                <TableCell className="max-w-40">
                  {r.note ? (
                    <span className="block truncate text-xs text-muted-foreground" title={r.note}>
                      {r.note}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                {canDelete ? (
                  <TableCell className="text-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      aria-label={`${t('common.delete')} ${docNo(prefix, r.number)}`}
                      onClick={() => onRequestDelete(r)}
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
                <DocCode>{docNo(prefix, r.number)}</DocCode>
                <MoneyCell value={r.amount} out={kind === 'PAYMENT'} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-medium">{r.partyName ?? '—'}</span>
                <PartyTypeChip pt={r.partyType} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{date(r.date, true)}</span>
                <MethodBadge method={String(r.method)} />
              </div>
              <LinkedInvoiceCell n={r.invoiceNumber ?? null} />
              {r.note ? (
                <p className="truncate text-xs text-muted-foreground" title={r.note}>
                  {r.note}
                </p>
              ) : null}
              {canDelete ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full text-destructive hover:text-destructive"
                  onClick={() => onRequestDelete(r)}
                >
                  <Trash2 className="me-1 size-4" aria-hidden />
                  {t('common.delete')}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- party mode radio row

function RadioGroupRow({
  label,
  mode,
  onMode,
  existingLabel,
  otherLabel,
}: {
  label: string
  mode: 'existing' | 'other'
  onMode: (m: 'existing' | 'other') => void
  existingLabel: string
  otherLabel: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {(['existing', 'other'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => onMode(m)}
            className={cn(
              'h-9 rounded-md border px-3 text-sm font-medium transition-colors',
              mode === m
                ? 'border-primary bg-primary/10 text-primary'
                : 'bg-background text-muted-foreground hover:bg-accent'
            )}
          >
            {m === 'existing' ? existingLabel : otherLabel}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- voucher form dialog (RECEIPT | PAYMENT)

export function VoucherFormDialog({
  kind,
  parties,
  onClose,
  onCreated,
}: {
  kind: 'RECEIPT' | 'PAYMENT'
  parties: PartyLite[]
  onClose: () => void
  onCreated: () => void
}) {
  const { t, money } = useI18n()
  const isRcv = kind === 'RECEIPT'

  const [phase, setPhase] = React.useState<'form' | 'done'>('form')
  const [created, setCreated] = React.useState<{ id: string; number: number } | null>(null)

  const [mode, setMode] = React.useState<'existing' | 'other'>('existing')
  const [partyId, setPartyId] = React.useState('')
  const [otherName, setOtherName] = React.useState('')
  const [linkEnabled, setLinkEnabled] = React.useState(false)
  const [invoiceId, setInvoiceId] = React.useState('')
  const [amountStr, setAmountStr] = React.useState('')
  const [method, setMethod] = React.useState<PayMethod>('CASH')
  const [dateStr, setDateStr] = React.useState('')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // balances (owed lookup) — fetched only while this dialog is mounted
  const bal = useApi<BalancesShape>('/api/reports/balances')
  const owedMap = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const c of bal.data?.customers ?? []) m.set(c.id, c.owed)
    for (const s of bal.data?.suppliers ?? []) m.set(s.id, s.owed)
    return m
  }, [bal.data])
  const pickedOwed = partyId ? owedMap.get(partyId) : undefined

  // open invoices of the chosen party — client-filtered because the list endpoint
  // matches a single exact status value
  const invParam = isRcv ? 'customerId' : 'supplierId'
  const invUrl =
    mode === 'existing' && linkEnabled && partyId
      ? `/api/invoices?type=${isRcv ? 'SALE' : 'PURCHASE'}&${invParam}=${partyId}&pageSize=100`
      : null
  const invList = useApi<{
    rows: Array<{ id: string; number: number; total: number; paidAmount: number; status: string }>
  }>(invUrl)
  const openInvoices = React.useMemo(
    () =>
      (invList.data?.rows ?? [])
        .filter((i) => i.status === 'UNPAID' || i.status === 'PARTIAL')
        .map((i) => ({ ...i, remaining: round2(i.total - i.paidAmount) }))
        .filter((i) => i.remaining > 0.009)
        .slice(0, 20),
    [invList.data]
  )

  function pickInvoice(id: string) {
    setInvoiceId(id)
    if (!amountStr.trim()) {
      const inv = openInvoices.find((i) => i.id === id)
      if (inv) setAmountStr(String(inv.remaining))
    }
  }

  async function submit() {
    const amount = parseAmount(amountStr)
    if (!(amount > 0)) {
      toast.error(t('fin.errAmount'))
      return
    }
    if (mode === 'existing' && !partyId) {
      toast.error(t('fin.errParty'))
      return
    }
    if (mode === 'other' && !otherName.trim()) {
      toast.error(t('fin.errParty'))
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        type: kind,
        amount,
        method,
        invoiceId: invoiceId || undefined,
        note: note.trim() || undefined,
        date: dateStr ? new Date(`${dateStr}T09:00:00`).toISOString() : undefined,
      }
      if (mode === 'existing') {
        body[isRcv ? 'customerId' : 'supplierId'] = partyId
      } else {
        body.partyType = 'OTHER'
        body.partyName = otherName.trim()
      }
      const v = await requestJson<VoucherRowDTO>('/api/vouchers', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      toast.success(t(isRcv ? 'fin.receiptDone' : 'fin.paymentDone', { n: v.number }))
      setCreated({ id: v.id, number: v.number })
      setPhase('done')
      onCreated()
    } catch (e) {
      const err = e as ApiError
      if (err.queued) {
        toast.info(t('common.savedOffline'))
        onCreated()
        onClose()
      } else if (err.message === 'invoice-type-mismatch') {
        toast.error(t('fin.mismatch'))
      } else if (err.message === 'amount-required') {
        toast.error(t('fin.errAmount'))
      } else {
        toast.error(t('common.error'))
      }
    } finally {
      setSaving(false)
    }
  }

  const dueBadge =
    pickedOwed !== undefined && Math.abs(pickedOwed) > 0.009 ? (
      <Badge
        variant="outline"
        className={cn(
          'whitespace-nowrap',
          pickedOwed > 0
            ? 'border-transparent bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
            : 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
        )}
      >
        <span dir="ltr" className="num-ltr">
          {pickedOwed > 0 ? '+' : '\u2212'}
        </span>
        <span className="num-ltr" dir="ltr">
          {money(Math.abs(pickedOwed))}
        </span>
        {' · '}
        {isRcv ? t('fin.dueBadgeCustomer') : t('fin.dueBadgeSupplier')}
      </Badge>
    ) : null

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        {phase === 'form' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg',
                    isRcv
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  )}
                >
                  <Banknote className="size-4" aria-hidden />
                </span>
                {isRcv ? t('fin.receiptTitle') : t('fin.paymentTitle')}
              </DialogTitle>
              <DialogDescription>{isRcv ? t('fin.receiptDesc') : t('fin.paymentDesc')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              <RadioGroupRow
                label={isRcv ? t('common.customer') : t('common.supplier')}
                mode={mode}
                onMode={(m) => {
                  setMode(m)
                  setPartyId('')
                  setOtherName('')
                  setLinkEnabled(false)
                  setInvoiceId('')
                }}
                existingLabel={t('fin.radioExisting')}
                otherLabel={t('fin.radioOther')}
              />

              {mode === 'existing' ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="voucher-party">{isRcv ? t('common.customer') : t('common.supplier')}</Label>
                  <Select
                    value={partyId}
                    onValueChange={(v) => {
                      setPartyId(v)
                      setInvoiceId('')
                    }}
                  >
                    <SelectTrigger id="voucher-party" className="w-full">
                      <SelectValue placeholder={isRcv ? t('fin.pickCustomer') : t('fin.pickSupplier')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(parties ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {dueBadge ? <div>{dueBadge}</div> : null}
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <Label htmlFor="voucher-other-name">{t('fin.radioOther')}</Label>
                  <Input
                    id="voucher-other-name"
                    value={otherName}
                    onChange={(e) => setOtherName(e.target.value)}
                    placeholder={t('fin.otherNamePh')}
                  />
                </div>
              )}

              {/* Optional invoice link */}
              {mode === 'existing' ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={linkEnabled}
                      onCheckedChange={(c) => {
                        setLinkEnabled(c === true)
                        setInvoiceId('')
                      }}
                    />
                    {t('fin.linkInvoiceToggle')}
                  </label>
                  {linkEnabled ? (
                    invList.loading ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.loading')}
                      </div>
                    ) : openInvoices.length === 0 ? (
                      <p className="py-1 text-xs text-muted-foreground">{t('fin.noOpenInvoices')}</p>
                    ) : (
                      <Select value={invoiceId} onValueChange={pickInvoice}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t('fin.pickInvoicePh')} />
                        </SelectTrigger>
                        <SelectContent>
                          {openInvoices.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {t('fin.invoiceOption', { n: i.number, rem: money(i.remaining) })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="voucher-amount">{t('fin.amountLabel')} *</Label>
                  <Input
                    id="voucher-amount"
                    dir="ltr"
                    inputMode="decimal"
                    className="num-ltr text-start"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <MethodSelectField label={t('common.method')} value={method} onChange={setMethod} />
              </div>

              <div className="grid gap-1.5 sm:w-1/2 sm:pe-1">
                <Label htmlFor="voucher-date">{t('fin.dateLabel')}</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="voucher-date"
                    type="date"
                    dir="ltr"
                    className="text-start"
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                  />
                  {dateStr ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0"
                      aria-label={t('fin.dateEmptyHint')}
                      onClick={() => setDateStr('')}
                    >
                      <CalendarX2 className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </div>
                {!dateStr ? <p className="text-xs text-muted-foreground">{t('fin.dateEmptyHint')}</p> : null}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="voucher-note">{t('common.notes')}</Label>
                <Textarea
                  id="voucher-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('fin.notePh')}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? (
                  <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
                ) : (
                  <BadgeCheck className="me-1 size-4" aria-hidden />
                )}
                {saving ? t('common.saving') : t('fin.saveVoucher')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <BadgeCheck className="size-5" aria-hidden />
                {t('fin.donePhaseTitle')}
              </DialogTitle>
              <DialogDescription>
                {t(isRcv ? 'fin.receiptDone' : 'fin.paymentDone', { n: created?.number ?? 0 })} —{' '}
                {t('fin.donePhaseHint')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => printDoc(isRcv ? 'receipt' : 'payment', created?.id ?? '', { paper: '80mm' })}
                >
                  <Printer className="me-1 size-4" aria-hidden />
                  {t('fin.print80')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => printDoc(isRcv ? 'receipt' : 'payment', created?.id ?? '', { paper: 'A4' })}
                >
                  <Printer className="me-1 size-4" aria-hidden />
                  {t('fin.printA4')}
                </Button>
              </div>
              <Button onClick={onClose}>{t('common.close')}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- expense form dialog

export function ExpenseFormDialog({
  categories,
  onClose,
  onCreated,
}: {
  categories: string[]
  onClose: () => void
  onCreated: () => void
}) {
  const { t } = useI18n()
  const listId = React.useId().replace(/[^a-zA-Z0-9]/g, '')
  const [category, setCategory] = React.useState('')
  const [amountStr, setAmountStr] = React.useState('')
  const [method, setMethod] = React.useState<PayMethod>('CASH')
  const [dateStr, setDateStr] = React.useState(todayISO())
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const suggestions = React.useMemo(() => {
    const set = new Set<string>([...DEFAULT_CATEGORIES, ...categories])
    return Array.from(set).sort()
  }, [categories])

  async function submit() {
    const amount = parseAmount(amountStr)
    if (!(amount > 0)) {
      toast.error(t('fin.errAmount'))
      return
    }
    setSaving(true)
    try {
      await requestJson('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category: category.trim() || DEFAULT_CATEGORIES[0],
          amount,
          method,
          note: note.trim() || undefined,
          date: dateStr ? new Date(`${dateStr}T09:00:00`).toISOString() : undefined,
        }),
      })
      toast.success(t('fin.expenseSaved'))
      onCreated()
      onClose()
    } catch (e) {
      const err = e as ApiError
      if (err.queued) {
        toast.info(t('common.savedOffline'))
        onCreated()
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
          <DialogTitle>{t('fin.expenseTitle')}</DialogTitle>
          <DialogDescription>{t('fin.expenseDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor={`exp-cat-${listId}`}>{t('fin.expenseCatLabel')}</Label>
            <Input
              id={`exp-cat-${listId}`}
              list={`exp-cats-${listId}`}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t('fin.expenseCatPh')}
              autoComplete="off"
            />
            <datalist id={`exp-cats-${listId}`}>
              {suggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">{t('fin.expenseCatHint')}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="exp-amount">{t('fin.amountLabel')} *</Label>
              <Input
                id="exp-amount"
                dir="ltr"
                inputMode="decimal"
                className="num-ltr text-start"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                autoComplete="off"
              />
            </div>
            <MethodSelectField label={t('common.method')} value={method} onChange={setMethod} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="exp-date">{t('fin.dateLabel')}</Label>
            <Input
              id="exp-date"
              type="date"
              dir="ltr"
              className="text-start"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="exp-note">{t('common.notes')}</Label>
            <Textarea
              id="exp-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('fin.notePh')}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="me-1 size-4 animate-spin" aria-hidden /> : null}
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

