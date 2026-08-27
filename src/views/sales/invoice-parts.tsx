'use client'

/**
 * Invoice detail building blocks shared by the POS + Sales screens.
 * Used ONLY by src/views/pos/POSView.tsx and src/views/sales/SalesView.tsx
 * (both owned by Task 3-a / PosSalesAgent).
 */

import * as React from 'react'
import {
  Banknote,
  CalendarX2,
  CircleUserRound,
  Loader2,
  MapPin,
  Package,
  Phone,
  Printer,
  ReceiptText,
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
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
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import EmptyState from '@/components/shared/empty-state'
import StatusBadge, { MethodBadge } from '@/components/shared/status-badge'
import { ApiError, requestJson, useApi } from '@/hooks/use-api'
import { useI18n } from '@/lib/i18n'
import type { InvoiceDetail, PayMethod } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSession } from '@/stores/session'

/** The API returns the party address too; it's just missing from the shared DTO. */
interface SalesInvoiceDetail extends InvoiceDetail {
  address?: string | null
}

// ---------------------------------------------------------------- helpers

/** INV-000123 style document label (always LTR digits). */
export function fmtDoc(prefix: string, n: number): string {
  return `${prefix}-${String(n ?? 0).padStart(6, '0')}`
}

const METHODS: PayMethod[] = ['CASH', 'BANK', 'CARD', 'WALLET']

export const METHOD_KEYS: PayMethod[] = METHODS

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Today as yyyy-mm-dd in the device timezone (for <input type=date>). */
export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function isStaffRole(role: string | undefined | null): boolean {
  return role === 'ADMIN' || role === 'MANAGER'
}

function online(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

/** Reactive navigator.onLine (event-driven; safe initial read). */
export function useOnline(): boolean {
  const [state, setState] = React.useState(true)
  React.useEffect(() => {
    void Promise.resolve().then(() => setState(navigator.onLine))
    const up = () => setState(true)
    const down = () => setState(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return state
}

/** Start/end label-value row used across totals blocks (RTL-safe). */
export function TotalRow({
  label,
  value,
  tone,
  bold,
}: {
  label: React.ReactNode
  value: React.ReactNode
  tone?: 'default' | 'emerald' | 'rose' | 'amber'
  bold?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={cn('text-sm text-muted-foreground', bold && 'font-semibold text-foreground')}>
        {label}
      </span>
      <span
        dir="ltr"
        className={cn(
          'num-ltr whitespace-nowrap text-sm font-medium tabular-nums',
          tone === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'rose' && 'text-destructive',
          tone === 'amber' && 'text-amber-600 dark:text-amber-400',
          bold && 'text-base font-bold text-foreground'
        )}
      >
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- payment dialog

interface PayDialogProps {
  invoice: InvoiceDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}

function PaymentDialog({ invoice, open, onOpenChange, onDone }: PayDialogProps) {
  const { t, money } = useI18n()
  const remaining = Math.max(0, round2(invoice.total - invoice.paidAmount))
  const [amount, setAmount] = React.useState('')
  const [method, setMethod] = React.useState<PayMethod>('CASH')
  const [date, setDate] = React.useState('')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  // Fresh prefill every time the dialog opens (deferred out of render).
  React.useEffect(() => {
    if (!open) return
    void Promise.resolve().then(() => {
      setAmount(String(remaining > 0 ? remaining : ''))
      setMethod('CASH')
      setDate('')
      setNote('')
    })
  }, [open])

  async function submit() {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      toast.error(t('sales.amountRequired'))
      return
    }
    if (value > remaining + 0.009) {
      toast.error(t('sales.overPay'))
      return
    }
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        type: 'RECEIPT',
        method,
        amount: round2(value),
        partyType: 'CUSTOMER',
        invoiceId: invoice.id,
        note: note.trim() || undefined,
      }
      if (date) body.date = new Date(`${date}T12:00:00`).toISOString()
      const v = await requestJson<{ number: number }>('/api/vouchers', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      toast.success(t('sales.paymentDone', { n: v.number }))
      onOpenChange(false)
      onDone()
    } catch (e) {
      if (e instanceof ApiError && e.queued) toast.info(t('common.savedOffline'))
      else toast.error(t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{t('sales.payTitle', { n: fmtDoc('INV', invoice.number) })}</DialogTitle>
          <DialogDescription>{t('sales.payDesc')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3.5 py-1">
          <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t('common.remaining')}</span>
            <span dir="ltr" className="num-ltr font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {money(remaining)}
            </span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">{t('common.amount')} *</Label>
            <Input
              id="pay-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              dir="ltr"
              className="num-ltr text-start"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('common.method')}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PayMethod)} disabled={busy}>
              <SelectTrigger aria-label={t('common.method')}>
                <SelectValue />
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
            <Label htmlFor="pay-date">{t('common.date')}</Label>
            <div className="flex items-center gap-1.5">
              <Input
                id="pay-date"
                type="date"
                dir="ltr"
                className="num-ltr"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={busy}
              />
              {date ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  aria-label={t('common.reset')}
                  onClick={() => setDate('')}
                  disabled={busy}
                >
                  <CalendarX2 className="size-4" />
                </Button>
              ) : null}
            </div>
            {!date ? <p className="text-xs text-muted-foreground">{t('sales.dateHint')}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-note">{t('common.notes')}</Label>
            <Input
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ReceiptText className="size-4" />}
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- detail sheet

export interface InvoiceDetailSheetProps {
  invoiceId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Notify the parent so it can refetch the list after payment/cancel. */
  onChanged?: () => void
}

export function InvoiceDetailSheet({ invoiceId, open, onOpenChange, onChanged }: InvoiceDetailSheetProps) {
  const { t, dir, money, date, num } = useI18n()
  const user = useSession((s) => s.user)

  const [sig, setSig] = React.useState(0)
  const url = open && invoiceId ? `/api/invoices/${invoiceId}?_r=${sig}` : null
  const detail = useApi<SalesInvoiceDetail>(url)
  const [payOpen, setPayOpen] = React.useState(false)
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [busyCancel, setBusyCancel] = React.useState(false)

  const inv = detail.data
  const staff = isStaffRole(user?.role)
  const canPrint = online()
  const remaining = inv ? Math.max(0, round2(inv.total - inv.paidAmount)) : 0
  const canPay = !!inv && staff && inv.status !== 'PAID' && inv.status !== 'CANCELLED'
  const canCancel = !!inv && staff && inv.status !== 'CANCELLED'

  function bump() {
    setSig((s) => s + 1)
    onChanged?.()
  }

  async function doCancel() {
    if (!invoiceId || !inv) return
    setBusyCancel(true)
    try {
      await requestJson(`/api/invoices/${invoiceId}`, { method: 'DELETE' })
      toast.success(t('sales.cancelDone', { n: fmtDoc('INV', inv.number) }))
      setCancelOpen(false)
      onOpenChange(false)
      bump()
    } catch (e) {
      if (e instanceof ApiError && e.queued) toast.info(t('common.savedOffline'))
      else toast.error(t('common.error'))
      setCancelOpen(false)
    } finally {
      setBusyCancel(false)
    }
  }

  // Reading-direction-aware side ("end"): sheet slides from the visual end.
  const side = dir === 'rtl' ? 'left' : 'right'

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side={side} className="w-full sm:max-w-[440px] p-0 flex flex-col gap-0">
          <SheetHeader className="border-b space-y-0 gap-0">
            {detail.loading && !inv ? (
              <div className="space-y-2 py-1">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            ) : inv ? (
              <>
                <div className="flex flex-wrap items-center gap-2 pe-8">
                  <SheetTitle dir="ltr" className="num-ltr text-lg font-extrabold tracking-tight">
                    {fmtDoc('INV', inv.number)}
                  </SheetTitle>
                  <StatusBadge status={inv.status} />
                </div>
                <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span>{date(inv.date, true)}</span>
                  {inv.createdBy ? (
                    <span className="inline-flex items-center gap-1">
                      <CircleUserRound className="size-3.5" aria-hidden />
                      {t('common.createdBy')}: {inv.createdBy}
                    </span>
                  ) : null}
                </SheetDescription>
              </>
            ) : null}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4">
            {detail.loading && !inv ? (
              <div className="space-y-3" aria-busy>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : !inv ? (
              <EmptyState
                icon={Package}
                title={t(detail.error ? 'sales.loadError' : 'common.noData')}
                action={
                  detail.error ? (
                    <Button variant="outline" size="sm" onClick={() => setSig((s) => s + 1)}>
                      {t('common.retry')}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                {/* party block */}
                <section className="rounded-xl border p-3 space-y-1.5">
                  <p className="font-semibold leading-tight">{inv.partyName ?? t('common.walkIn')}</p>
                  {inv.customerPhone ? (
                    <p className="text-sm flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="size-3.5 shrink-0" aria-hidden />
                      <a
                        href={`tel:${inv.customerPhone}`}
                        dir="ltr"
                        className="num-ltr text-primary underline-offset-4 hover:underline"
                      >
                        {inv.customerPhone}
                      </a>
                    </p>
                  ) : null}
                  {inv.address ? (
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <MapPin className="size-3.5 shrink-0 mt-0.5" aria-hidden />
                      <span>{inv.address}</span>
                    </p>
                  ) : null}
                  {inv.warehouseName ? (
                    <Badge variant="secondary" className="whitespace-normal text-start">
                      <MapPin className="size-3 me-1" aria-hidden />
                      {t('sales.warehouseChip', { name: inv.warehouseName })}
                    </Badge>
                  ) : null}
                  {inv.notes ? (
                    <p className="text-sm italic text-muted-foreground border-t pt-2 mt-2">
                      “{inv.notes}”
                    </p>
                  ) : null}
                </section>

                {/* items */}
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    {t('sales.itemsTitle')}
                  </h3>
                  <div className="rounded-xl border divide-y overflow-hidden">
                    {inv.items.map((it) => (
                      <div key={it.id} className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{it.nameSnap}</p>
                          <p dir="ltr" className="num-ltr text-[11px] text-muted-foreground tabular-nums text-start">
                            {t('sales.itemsLine', { n: num(it.qty), price: num(it.price) })}
                            {it.unitSnap ? ` ${it.unitSnap}` : ''}
                            {it.barcodeSnap ? ` · ${it.barcodeSnap}` : ''}
                          </p>
                        </div>
                        <span dir="ltr" className="num-ltr shrink-0 text-sm font-semibold tabular-nums">
                          {money(it.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* totals */}
                <section className="rounded-xl bg-muted/50 p-3 space-y-1.5">
                  <TotalRow label={t('common.subtotal')} value={money(inv.subtotal)} />
                  {inv.discount > 0 ? (
                    <TotalRow label={`${t('common.discount')}`} value={`− ${money(inv.discount)}`} />
                  ) : null}
                  <TotalRow
                    label={t('pos.taxPct', { p: num(inv.taxPercent, 2) })}
                    value={money(inv.taxAmount)}
                  />
                  <Separator className="my-1" />
                  <TotalRow label={t('common.total')} value={money(inv.total)} bold />
                  <TotalRow label={t('common.paid')} value={money(inv.paidAmount)} tone="emerald" />
                  {remaining > 0.009 && inv.status !== 'CANCELLED' ? (
                    <TotalRow label={t('common.remaining')} value={money(remaining)} tone="rose" bold />
                  ) : null}
                </section>

                {/* payments */}
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    {t('sales.paymentsTitle')}
                  </h3>
                  {inv.vouchers.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic px-1">{t('sales.noPayments')}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {inv.vouchers.map((v) => (
                        <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <Banknote className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                            <span dir="ltr" className="num-ltr text-xs font-semibold tabular-nums truncate">
                              VCH-{String(v.number).padStart(4, '0')}
                            </span>
                            <MethodBadge method={v.method} />
                          </div>
                          <span dir="ltr" className="num-ltr shrink-0 text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                            {money(v.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>

          {/* footer actions */}
          {inv ? (
            <div className="border-t p-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <div className="grid grid-cols-2 gap-2">
                {staff ? (
                  canPay ? (
                    <Button variant="default" size="sm" className="col-span-2 h-10" onClick={() => setPayOpen(true)}>
                      <ReceiptText className="size-4" aria-hidden />
                      {t('sales.payAction')}
                    </Button>
                  ) : null
                ) : null}
                {canPrint ? (
                  <>
                    <Button variant="outline" size="sm" className="h-10" onClick={() => void printNow(inv.id, 'A4')}>
                      <Printer className="size-4" aria-hidden />
                      {t('sales.printA4')}
                    </Button>
                    <DropdownMenuPaper invoiceId={inv.id} label={t('sales.printThermal80')} />
                  </>
                ) : (
                  <p className="col-span-2 text-center text-xs text-muted-foreground">{t('sales.offlineNoPrint')}</p>
                )}
                {canCancel ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="col-span-2 h-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setCancelOpen(true)}
                  >
                    {t('sales.cancelAction')}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {inv ? (
        <PaymentDialog invoice={inv} open={payOpen} onOpenChange={setPayOpen} onDone={bump} />
      ) : null}

      <AlertDialog open={cancelOpen} onOpenChange={(o) => !busyCancel && setCancelOpen(o)}>
        <AlertDialogContent className="max-h-[85dvh] overflow-y-auto scrollbar-thin">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sales.cancelTitle', { n: fmtDoc('INV', inv?.number ?? 0) })}</AlertDialogTitle>
            <AlertDialogDescription>{t('sales.cancelDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyCancel}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive"
              onClick={(e) => {
                e.preventDefault()
                void doCancel()
              }}
              disabled={busyCancel}
            >
              {busyCancel ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t('sales.cancelYes')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ---------------------------------------------------------------- print dropdown (thermal sizes incl. hidden 58mm)

/** Trigger prints 80mm directly; additional thermal sizes live inside this menu. */
function DropdownMenuPaper({
  invoiceId,
  label,
  menuItems = ['58mm'],
}: {
  invoiceId: string
  label: string
  menuItems?: Array<'80mm' | '58mm'>
}) {
  const { t } = useI18n()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-full h-10 justify-start gap-2">
          <Printer className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {menuItems.map((paper) => (
          <DropdownMenuItem key={paper} onClick={() => void printNow(invoiceId, paper)}>
            {t(`sales.printThermal${paper === '80mm' ? '80' : '58'}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

async function printNow(invoiceId: string, paper: 'A4' | '80mm' | '58mm') {
  const { printDoc } = await import('@/lib/print/client')
  void printDoc('invoice', invoiceId, { paper })
}
