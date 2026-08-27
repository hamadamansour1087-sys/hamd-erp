'use client'

/**
 * Shared building blocks for the People screens (CustomersView + SuppliersView).
 * Used ONLY by src/views/people/*.tsx (same task owner).
 */

import * as React from 'react'
import {
  Banknote,
  CalendarX2,
  FileText,
  Loader2,
  MapPin,
  Phone,
  ReceiptText,
  Search,
} from 'lucide-react'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import EmptyState from '@/components/shared/empty-state'
import StatusBadge from '@/components/shared/status-badge'
import { useI18n } from '@/lib/i18n'
import { ApiError, requestJson, useApi } from '@/hooks/use-api'
import type { InvoiceStatus, PayMethod } from '@/lib/types'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------- kinds & DTOs

export type PartyKind = 'customer' | 'supplier'

/** CustomerDTO and SupplierDTO share the exact same flat shape. */
export interface PartyBase {
  id: string
  name: string
  phone: string | null
  address: string | null
  openingBalance: number
  notes: string | null
}

export interface PartyInvoiceMini {
  id: string
  number: number
  date: string
  total: number
  paidAmount: number
  status: InvoiceStatus
}

export interface PartyStatement extends PartyBase {
  owed: number
  invoices: PartyInvoiceMini[]
  /** Σ receipts not linked to an invoice (customers) */
  standaloneReceipts?: number
  /** Σ payments not linked to an invoice (suppliers) */
  standalonePayments?: number
}

export interface BalancesDTO {
  customers: Array<{ id: string; name: string; phone: string | null; owed: number }>
  suppliers: Array<{ id: string; name: string; phone: string | null; owed: number }>
  totals: { receivables: number; payables: number }
}

// ---------------------------------------------------------------- pure helpers

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
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

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Today as yyyy-mm-dd in the device timezone (for <input type=date>). */
export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** REST collection path for a party kind. */
export function partyCollection(kind: PartyKind): string {
  return kind === 'customer' ? '/api/customers' : '/api/suppliers'
}

// ---------------------------------------------------------------- data hooks

/** Triad of feeds every people screen needs: filtered list, totals list, balances. */
export function usePeopleData(kind: PartyKind, q: string): {
  filtered: { data?: PartyBase[]; loading: boolean; refetch: () => void }
  all: { data?: PartyBase[]; loading: boolean; refetch: () => void }
  balances: { data?: BalancesDTO; loading: boolean; refetch: () => void }
} {
  const dq = useDebounced(q, 350).trim()
  const listUrl = `${partyCollection(kind)}?q=${encodeURIComponent(dq)}`
  const filtered = useApi<PartyBase[]>(listUrl)
  const all = useApi<PartyBase[]>(partyCollection(kind))
  const balances = useApi<BalancesDTO>('/api/reports/balances')
  return { filtered, all, balances }
}

/** Short initials for avatars (up to 2 letters, works for Arabic too). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2)
  return `${parts[0][0]}${parts[1][0]}`
}

// ---------------------------------------------------------------- small pieces

const AVATAR_TONES = [
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
]

/** Deterministic-tinted avatar showing the party's initials. */
export function PartyAvatar({ name, className }: { name: string; className?: string }) {
  const code = Array.from(name).reduce((s, ch) => s + ch.charCodeAt(0), 0)
  return (
    <Avatar className={className}>
      <AvatarFallback className={cn('font-semibold', AVATAR_TONES[code % AVATAR_TONES.length])}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

/** Tiny inline spinner with optional label. */
export function InlineSpinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" aria-hidden />
      {label}
    </span>
  )
}

type ChipTone = 'rose' | 'amber' | 'emerald' | 'muted'

const CHIP_CLASSES: Record<ChipTone, string> = {
  rose: 'border-transparent bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-300',
  amber:
    'border-transparent bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300',
  emerald:
    'border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300',
  muted: '',
}

interface ChipInfo {
  key: string
  tone: ChipTone
  moneyTone: string
  bigLabelKey: string
  bigCaptionKey: string
}

/**
 * Semantics of `owed` (>0) differ per kind:
 *  - customer owes us  → rose/destructive («مدين»)
 *  - we owe supplier   → amber/warn      («نحن مدينون له»)
 * Negative in both cases = credit in our favor (emerald), zero = settled (muted).
 */
export function chipInfo(kind: PartyKind, owed: number, eps = 0.009): ChipInfo {
  if (owed > eps) {
    return kind === 'customer'
      ? {
          key: 'people.chipOwes',
          tone: 'rose',
          moneyTone: 'text-destructive',
          bigLabelKey: 'people.currentDueCust',
          bigCaptionKey: 'people.statementFormulaCust',
        }
      : {
          key: 'people.chipWeOwe',
          tone: 'amber',
          moneyTone: 'text-amber-600 dark:text-amber-400',
          bigLabelKey: 'people.currentDueSupp',
          bigCaptionKey: 'people.statementFormulaSupp',
        }
  }
  if (owed < -eps) {
    return kind === 'customer'
      ? {
          key: 'people.chipCredit',
          tone: 'emerald',
          moneyTone: 'text-emerald-600 dark:text-emerald-400',
          bigLabelKey: 'people.inFavorCust',
          bigCaptionKey: 'people.statementFormulaCust',
        }
      : {
          key: 'people.chipSupplierCredit',
          tone: 'emerald',
          moneyTone: 'text-emerald-600 dark:text-emerald-400',
          bigLabelKey: 'people.inFavorSupp',
          bigCaptionKey: 'people.statementFormulaSupp',
        }
  }
  return {
    key: kind === 'customer' ? 'people.chipSettledCust' : 'people.chipSettledSupp',
    tone: 'muted',
    moneyTone: 'text-muted-foreground',
    bigLabelKey: kind === 'customer' ? 'people.inFavorCust' : 'people.inFavorSupp',
    bigCaptionKey: kind === 'customer' ? 'people.statementFormulaCust' : 'people.statementFormulaSupp',
  }
}

/** Colored signed money figure (uses minus sign U+2212 for negatives). */
export function SignedMoney({
  owed,
  kind,
  className,
}: {
  owed: number
  kind: PartyKind
  className?: string
}) {
  const { money } = useI18n()
  const info = chipInfo(kind, owed)
  const sign = owed > 0 ? '+' : owed < 0 ? '\u2212' : ''
  return (
    <span
      dir="ltr"
      className={cn('num-ltr inline-block whitespace-nowrap font-semibold tabular-nums', info.moneyTone, className)}
    >
      {sign}
      {money(Math.abs(owed))}
    </span>
  )
}

/** Small status chip describing the balance direction. */
export function BalanceChip({ owed, kind }: { owed: number; kind: PartyKind }) {
  const { t } = useI18n()
  const info = chipInfo(kind, owed)
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap px-1.5 py-0 text-[11px]', CHIP_CLASSES[info.tone])}>
      {t(info.key)}
    </Badge>
  )
}

/** Phone rendered as a styled `tel:` link (always LTR digits). */
export function PhoneLink({ phone, className }: { phone: string; className?: string }) {
  return (
    <a
      href={`tel:${phone}`}
      dir="ltr"
      className={cn(
        'num-ltr inline-block max-w-[16ch] truncate text-start align-middle text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none',
        className
      )}
    >
      {phone}
    </a>
  )
}

/** Column-header legend tooltip explaining the sign convention. */
export function BalanceLegend({ tip }: { tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={tip}
        title={tip}
        className="inline-flex size-5 cursor-help items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
      >
        <InfoGlyph />
      </TooltipTrigger>
      <TooltipContent className="max-w-56 text-balance">{tip}</TooltipContent>
    </Tooltip>
  )
}

function InfoGlyph() {
  // Inline SVG keeps the trigger dependency-free while staying ≤44px friendly.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

// ---------------------------------------------------------------- sticky toolbar

/** Search bar pinned under the app topbar (topbar itself is sticky h-16 top-0). */
export function PeopleToolbar({
  placeholder,
  value,
  onChange,
  addAction,
}: {
  placeholder: string
  value: string
  onChange: (v: string) => void
  addAction?: React.ReactNode
}) {
  return (
    <div className="sticky top-16 z-20 -mx-1 mb-3 rounded-lg border-b bg-background/90 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 start-2.5 z-10 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="ps-8"
            autoComplete="off"
            inputMode="search"
          />
        </div>
        {addAction}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- form dialog

/**
 * Create / edit a party. Editing pre-fills all fields; opening balance has a
 * legend tooltip (people.openingHint).
 */
export function PartyFormDialog({
  kind,
  open,
  editing,
  onOpenChange,
  onSaved,
}: {
  kind: PartyKind
  open: boolean
  editing: PartyBase | null
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [address, setAddress] = React.useState('')
  const [opening, setOpening] = React.useState('0')
  const [notes, setNotes] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    void Promise.resolve().then(() => {
      setName(editing?.name ?? '')
      setPhone(editing?.phone ?? '')
      setAddress(editing?.address ?? '')
      setOpening(editing ? String(editing.openingBalance ?? 0) : '0')
      setNotes(editing?.notes ?? '')
    })
  }, [open, editing])

  async function save() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const body = JSON.stringify({
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        openingBalance: Number(opening) || 0,
        notes: notes.trim() || undefined,
      })
      if (editing) {
        await requestJson(`${partyCollection(kind)}/${editing.id}`, { method: 'PUT', body })
      } else {
        await requestJson(partyCollection(kind), { method: 'POST', body })
      }
      toast.success(t(kind === 'customer' ? 'people.custSaved' : 'people.suppSaved'))
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error(e instanceof ApiError && e.queued ? t('common.savedOffline') : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] gap-3 overflow-y-auto scrollbar-thin sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(
              editing
                ? kind === 'customer'
                  ? 'people.editCustomer'
                  : 'people.editSupplier'
                : kind === 'customer'
                  ? 'people.addCustomer'
                  : 'people.addSupplier'
            )}
          </DialogTitle>
          <DialogDescription>{editing?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-0.5">
          <div className="space-y-1.5">
            <Label htmlFor="party-name">{t('common.name')} *</Label>
            <Input
              id="party-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('common.name')}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="party-phone">{t('common.phone')}</Label>
              <Input
                id="party-phone"
                dir="ltr"
                inputMode="tel"
                type="tel"
                className="num-ltr text-start"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="party-opening" className="flex items-center gap-1">
                {t('common.openingBalance')}
                <BalanceLegend tip={t('people.openingHint')} />
              </Label>
              <Input
                id="party-opening"
                dir="ltr"
                type="number"
                step="any"
                inputMode="decimal"
                className="num-ltr text-start"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="party-address">{t('common.address')}</Label>
            <Input
              id="party-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('common.address')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="party-notes">{t('common.notes')}</Label>
            <Textarea
              id="party-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('people.notesPh')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={busy || !name.trim()}>
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- voucher dialog

const METHODS: PayMethod[] = ['CASH', 'BANK', 'CARD', 'WALLET']

/** Quick RECEIPT (customer) / PAYMENT (supplier) voucher creation dialog. */
export function VoucherDialog({
  kind,
  open,
  onOpenChange,
  partyId,
  partyName,
  partyOwed,
  onDone,
}: {
  kind: PartyKind
  open: boolean
  onOpenChange: (o: boolean) => void
  partyId: string
  partyName: string
  partyOwed: number
  onDone: () => void
}) {
  const { t } = useI18n()
  const isCustomer = kind === 'customer'
  const [amount, setAmount] = React.useState('')
  const [method, setMethod] = React.useState<PayMethod>('CASH')
  const [dateStr, setDateStr] = React.useState('')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    void Promise.resolve().then(() => {
      setAmount('')
      setMethod('CASH')
      setDateStr(todayISO())
      setNote('')
    })
  }, [open])

  async function submit() {
    const amt = round2(Number(amount))
    if (!(amt > 0)) {
      toast.error(t('people.amountRequired'))
      return
    }
    setBusy(true)
    try {
      const res = await requestJson<{ number: number }>('/api/vouchers', {
        method: 'POST',
        body: JSON.stringify({
          type: isCustomer ? 'RECEIPT' : 'PAYMENT',
          ...(isCustomer ? { customerId: partyId } : { supplierId: partyId }),
          amount: amt,
          method,
          note: note.trim() || undefined,
          ...(dateStr ? { date: new Date(`${dateStr}T00:00:00`).toISOString() } : {}),
        }),
      })
      toast.success(t(isCustomer ? 'people.receiptDone' : 'people.paymentDone', { n: res.number }))
      onOpenChange(false)
      onDone()
    } catch (e) {
      if (e instanceof ApiError && e.queued) toast.info(t('common.savedOffline'))
      else toast.error(t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const info = chipInfo(kind, partyOwed)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] gap-3 overflow-y-auto scrollbar-thin sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCustomer ? (
              <ReceiptText className="size-4 text-primary" aria-hidden />
            ) : (
              <Banknote className="size-4 text-primary" aria-hidden />
            )}
            {t(isCustomer ? 'people.receiptTitle' : 'people.paymentTitle')}
          </DialogTitle>
          <DialogDescription>{t(isCustomer ? 'people.receiptDesc' : 'people.paymentDesc')}</DialogDescription>
        </DialogHeader>

        {/* locked party chip */}
        <div className="rounded-lg border bg-muted/40 p-3">
          <Label className="text-xs text-muted-foreground">{t(isCustomer ? 'common.customer' : 'common.supplier')}</Label>
          <div className="mt-1.5 flex items-center gap-2.5" aria-readonly>
            <PartyAvatar name={partyName} className="size-9" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">{partyName}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="truncate">{t(info.bigLabelKey)}</span>
                <SignedMoney owed={partyOwed} kind={kind} className="text-xs" />
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="voucher-amount">{t('common.amount')} *</Label>
          <Input
            id="voucher-amount"
            dir="ltr"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            className="num-ltr text-start"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('common.method')}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PayMethod)}>
              <SelectTrigger className="w-full" aria-label={t('common.method')}>
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
          <div className="space-y-1.5">
            <Label htmlFor="voucher-date">{t('common.date')}</Label>
            <div className="flex items-center gap-1">
              <Input
                id="voucher-date"
                dir="ltr"
                type="date"
                className="num-ltr text-start"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
              />
              {dateStr ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={t('people.clearDate')}
                  title={t('people.clearDate')}
                  onClick={() => setDateStr('')}
                >
                  <CalendarX2 className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
            {!dateStr ? (
              <p className="text-xs text-muted-foreground">{t('people.voucherDatePh')}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="voucher-note">{t('common.notes')}</Label>
          <Textarea
            id="voucher-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('people.voucherNotePh')}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? t('common.saving') : t('people.recordVoucher')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- statement sheet

/**
 * Account statement side sheet (side follows the reading-direction "end").
 * Profile block · big tone-colored balance + formula caption · recent invoices
 * mini-table · standalone vouchers total line.
 */
export function StatementSheet({
  kind,
  open,
  partyId,
  voucherAllowed,
  onOpenChange,
  onRequestVoucher,
  reloadSignal = 0,
}: {
  kind: PartyKind
  open: boolean
  partyId: string | null
  voucherAllowed: boolean
  onOpenChange: (o: boolean) => void
  onRequestVoucher: (s: PartyStatement) => void
  /** bump to force a refetch of the open statement (e.g. after a new voucher) */
  reloadSignal?: number
}) {
  const { t, dir, money, date } = useI18n()
  const url =
    open && partyId
      ? `${partyCollection(kind)}/${partyId}${reloadSignal > 0 ? `?_r=${reloadSignal}` : ''}`
      : null
  const detail = useApi<PartyStatement>(url)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={dir === 'rtl' ? 'left' : 'right'}
        className="w-full gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b pb-3">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="size-4 text-primary" aria-hidden />
            {t('people.statementTitle')}
          </SheetTitle>
          <SheetDescription className="truncate">{detail.data?.name ?? ''}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-8 scrollbar-thin">
          {detail.loading && !detail.data ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : detail.error && !detail.data ? (
            <EmptyState icon={FileText} title={t('common.error')} action={
              <Button variant="outline" size="sm" onClick={detail.refetch}>
                {t('common.retry')}
              </Button>
            } />
          ) : detail.data ? (
            <StatementBody
              s={detail.data}
              kind={kind}
              voucherAllowed={voucherAllowed}
              refreshing={detail.loading}
              onRequestVoucher={onRequestVoucher}
              money={money}
              date={date}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function StatementBody({
  s,
  kind,
  voucherAllowed,
  refreshing,
  onRequestVoucher,
  money,
  date,
}: {
  s: PartyStatement
  kind: PartyKind
  voucherAllowed: boolean
  refreshing: boolean
  onRequestVoucher: (s: PartyStatement) => void
  money: (n: number) => string
  date: (d: string, withTime?: boolean) => string
}) {
  const { t, num } = useI18n()
  const isCustomer = kind === 'customer'
  const info = chipInfo(kind, s.owed)

  return (
    <>
      {/* profile block */}
      <div className="flex items-start gap-3">
        <PartyAvatar name={s.name} className="size-12" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate font-bold leading-tight">{s.name}</p>
          {s.phone ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="size-3.5 shrink-0" aria-hidden />
              <PhoneLink phone={s.phone} className="max-w-full text-muted-foreground" />
            </p>
          ) : null}
          {s.address ? (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-2">{s.address}</span>
            </p>
          ) : null}
        </div>
        {refreshing ? <Loader2 className="mt-1 size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden /> : null}
      </div>

      {/* balance hero */}
      <div className="rounded-xl border bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground">{t(info.bigLabelKey)}</p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <SignedMoney owed={s.owed} kind={kind} className="text-2xl font-bold tracking-tight" />
          <BalanceChip owed={s.owed} kind={kind} />
        </div>
        <p className="mt-2 border-t pt-2 text-xs italic leading-relaxed text-muted-foreground">
          {t('people.netBalance')} = {t(info.bigCaptionKey)}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t('common.openingBalance')}</span>
          <span dir="ltr" className="num-ltr tabular-nums">{money(s.openingBalance)}</span>
        </div>
      </div>

      {/* standalone vouchers */}
      <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          {isCustomer ? (
            <ReceiptText className="size-4 shrink-0" aria-hidden />
          ) : (
            <Banknote className="size-4 shrink-0" aria-hidden />
          )}
          <span className="truncate">
            {t(isCustomer ? 'people.standaloneReceiptsLine' : 'people.standalonePaymentsLine')}
          </span>
        </span>
        <span dir="ltr" className="num-ltr shrink-0 text-sm font-semibold tabular-nums">
          {money(isCustomer ? (s.standaloneReceipts ?? 0) : (s.standalonePayments ?? 0))}
        </span>
      </div>

      {/* recent invoices */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t(isCustomer ? 'people.recentInvoicesCust' : 'people.recentInvoicesSupp')}</h3>
          <span className="text-xs text-muted-foreground num-ltr" dir="ltr">({num(s.invoices.length, 0)})</span>
        </div>
        {s.invoices.length === 0 ? (
          <EmptyState icon={FileText} title={t('people.noInvoices')} />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <div className="max-h-64 overflow-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="whitespace-nowrap">{t('people.colInvoice')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('common.date')}</TableHead>
                    <TableHead className="whitespace-nowrap text-end">{t('common.total')}</TableHead>
                    <TableHead className="whitespace-nowrap text-end">{t('common.paid')}</TableHead>
                    <TableHead className="whitespace-nowrap text-end">{t('common.remaining')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('common.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.invoices.map((inv) => {
                    const rem = round2(inv.total - inv.paidAmount)
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="whitespace-nowrap font-medium num-ltr" dir="ltr">
                          #{inv.number}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {date(inv.date)}
                        </TableCell>
                        <TableCell dir="ltr" className="whitespace-nowrap text-end num-ltr tabular-nums">
                          {money(inv.total)}
                        </TableCell>
                        <TableCell dir="ltr" className="whitespace-nowrap text-end num-ltr tabular-nums text-muted-foreground">
                          {money(inv.paidAmount)}
                        </TableCell>
                        <TableCell
                          dir="ltr"
                          className={cn(
                            'whitespace-nowrap text-end font-semibold num-ltr tabular-nums',
                            rem > 0.009 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          {money(rem)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={inv.status} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {voucherAllowed ? (
        <Button variant="outline" className="w-full" onClick={() => onRequestVoucher(s)}>
          {isCustomer ? <ReceiptText className="size-4" aria-hidden /> : <Banknote className="size-4" aria-hidden />}
          {t('people.recordVoucherHere')}
        </Button>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------- delete confirm

/** Reusable delete confirmation wired to DELETE {collection}/[id] with 'in-use' handling. */
export function DeletePartyDialog({
  kind,
  target,
  busy,
  onConfirm,
  onClose,
}: {
  kind: PartyKind
  target: PartyBase | null
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-h-[85dvh] overflow-y-auto scrollbar-thin">
        <AlertDialogHeader>
          <AlertDialogTitle>{t(kind === 'customer' ? 'people.deleteCustomerTitle' : 'people.deleteSupplierTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {target?.name} — {t('common.confirmDelete')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
          >
            {t('common.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
