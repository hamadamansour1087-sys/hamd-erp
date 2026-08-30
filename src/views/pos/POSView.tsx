'use client'

/**
 * Point of Sale — Task 3-a (PosSalesAgent).
 *
 * Desktop: products grid + sticky cart panel at the reading-direction end.
 * Mobile: stacked with a sticky bottom cart summary bar opening a bottom Sheet.
 * Barcode-wedge friendly search (Enter → exact barcode / single match adds).
 * F2 completes the sale. Offline sales queue locally and skip printing.
 */

import * as React from 'react'
import {
  Check,
  ChevronsUpDown,
  Loader2,
  Minus,
  MoreHorizontal,
  Package,
  PackageX,
  Plus,
  Printer,
  ScanLine,
  Search,
  ShoppingBasket,
  UserRound,
  WifiOff,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import EmptyState from '@/components/shared/empty-state'
import PageHeader from '@/components/shared/page-header'
import { ApiError, requestJson, useApi } from '@/hooks/use-api'
import { onQueueChange } from '@/lib/offline/queue'
import { useI18n } from '@/lib/i18n'
import type {
  CategoryDTO,
  CustomerDTO,
  InvoiceStatus,
  OrgDTO,
  PaperKind,
  PayMethod,
  ProductDTO,
  WarehouseDTO,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { round2Client } from '@/lib/format'
import { cartTotals, useCart } from '@/stores/cart'
import { useUIStore } from '@/stores/ui'
import { fmtDoc, useOnline } from '../sales/invoice-parts'

// ---------------------------------------------------------------- shapes

interface PosProduct extends ProductDTO {
  stock?: number
  unitShort?: string | null
  categoryName?: string | null
}

interface BootstrapDTO {
  org: OrgDTO
  categories: CategoryDTO[]
  warehouses: WarehouseDTO[]
  products: PosProduct[]
  customers: Pick<CustomerDTO, 'id' | 'name' | 'phone'>[]
}

interface CreatedInvoice {
  id: string
  number: number
  status: InvoiceStatus
  total: number
  warnings?: string[]
}

interface SuccessState {
  id: string
  number: number
  status: InvoiceStatus | 'QUEUED'
  total: number
  paid: number
  method: PayMethod
  queued: boolean
}

const METHODS: PayMethod[] = ['CASH', 'BANK', 'CARD', 'WALLET']
const QUICK_CASH = [50, 100, 200]

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2)
  return `${parts[0][0]}${parts[1][0]}`
}

function stockBadge(p: PosProduct): { cls: string; out: boolean } | null {
  if (!p.trackStock) return null
  const qty = p.stock ?? 0
  if (qty <= 0) return { cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', out: true }
  if (p.minQty > 0 && qty <= p.minQty)
    return { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300', out: false }
  return { cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300', out: false }
}

/**
 * POS sync status pill (OFFLINE / SYNCING / PENDING / FAILED / SYNCED).
 * Pure display — the sync engine itself lives in lib/offline/queue + the
 * QueueFlusher provider, which broadcast tijara-syncing / tijara-synced /
 * tijara-sync-failed. Priority: OFFLINE > SYNCING > FAILED > PENDING > SYNCED.
 */
function PosSyncPill() {
  const { t, num } = useI18n()
  const online = useOnline()
  const [pending, setPending] = React.useState(0)
  const [phase, setPhase] = React.useState<'idle' | 'syncing' | 'synced' | 'failed'>('idle')
  const timerRef = React.useRef<number | null>(null)

  React.useEffect(() => onQueueChange(setPending), [])

  React.useEffect(() => {
    const onSyncing = () => setPhase('syncing')
    const onSynced = () => {
      setPhase('synced')
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setPhase('idle'), 3500)
    }
    const onFailed = () => setPhase('failed')
    window.addEventListener('tijara-syncing', onSyncing)
    window.addEventListener('tijara-synced', onSynced)
    window.addEventListener('tijara-sync-failed', onFailed)
    return () => {
      window.removeEventListener('tijara-syncing', onSyncing)
      window.removeEventListener('tijara-synced', onSynced)
      window.removeEventListener('tijara-sync-failed', onFailed)
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const base = 'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium'
  const amber = 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
  if (!online) {
    return (
      <span role="status" className={cn(base, 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300')}>
        <WifiOff className="size-3.5" aria-hidden />
        {t('pos.offlinePill')}
        {pending > 0 ? <span className="rounded-full bg-red-100 px-1.5 dark:bg-red-900/60">{num(pending)}</span> : null}
      </span>
    )
  }
  if (phase === 'syncing') {
    return (
      <span role="status" className={cn(base, amber)}>
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {t('pos.syncingPill')}
      </span>
    )
  }
  if (phase === 'failed' && pending > 0) {
    return (
      <span role="status" className={cn(base, amber)}>
        <WifiOff className="size-3.5" aria-hidden />
        {t('pos.failedPill')}
      </span>
    )
  }
  if (pending > 0) {
    return (
      <span role="status" className={cn(base, amber)}>
        <Loader2 className="size-3.5" aria-hidden />
        {t('shell.pendingSync', { n: pending })}
      </span>
    )
  }
  if (phase === 'synced') {
    return (
      <span role="status" className={cn(base, 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300')}>
        <Check className="size-3.5" aria-hidden />
        {t('pos.syncedPill')}
      </span>
    )
  }
  return null
}

export default function POSView() {
  const { t, money, num } = useI18n()
  const boot = useApi<BootstrapDTO>('/api/bootstrap')
  const onlineState = useOnline()
  const setView = useUIStore((s) => s.setView)

  // ---------------- cart store ----------------
  const lines = useCart((s) => s.lines)
  const customerId = useCart((s) => s.customerId)
  const customerName = useCart((s) => s.customerName)

  // ---------------- catalog filters ----------------
  const [search, setSearch] = React.useState('')
  const [catId, setCatId] = React.useState<string>('')
  const [flash, setFlash] = React.useState<{ id: string; k: number } | null>(null)
  const [cartSheetOpen, setCartSheetOpen] = React.useState(false)

  // Single cart instance per viewport: the aside hosts it on lg+, the bottom
  // Sheet below lg. Mounting BOTH would share custOpen — the hidden aside's
  // popover escapes its display:none via the Radix portal and ghosts behind
  // the Sheet's overlay on phones. (CSS `hidden lg:block` cannot stop the
  // portal — only conditional mounting can.)
  const [cartOnAside, setCartOnAside] = React.useState(true)
  React.useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    const onChange = () => {
      setCartOnAside(mql.matches)
      if (mql.matches) setCartSheetOpen(false) // switching to the aside closes the sheet
    }
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const allProducts = boot.data?.products ?? []
  const categories = boot.data?.categories ?? []
  const warehouses = boot.data?.warehouses ?? []

  const visibleProducts = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = allProducts
    if (catId) list = list.filter((p) => p.categoryId === catId)
    if (!q) return list
    const starts: PosProduct[] = []
    const contains: PosProduct[] = []
    for (const p of list) {
      const name = p.name.toLowerCase()
      const nameEn = (p.nameEn ?? '').toLowerCase()
      const barcode = (p.barcode ?? '').toLowerCase()
      if (name.startsWith(q) || nameEn.startsWith(q) || barcode.startsWith(q)) starts.push(p)
      else if (
        name.includes(q) ||
        nameEn.includes(q) ||
        barcode.includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q)
      )
        contains.push(p)
    }
    return [...starts, ...contains]
  }, [allProducts, catId, search])

  // clear the add-to-cart pulse shortly after it starts
  React.useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => setFlash(null), 280)
    return () => window.clearTimeout(id)
  }, [flash])

  // ---------------- warehouse default ----------------
  const [whId, setWhId] = React.useState('')
  React.useEffect(() => {
    const list = boot.data?.warehouses
    if (!list?.length) return
    void Promise.resolve().then(() => {
      setWhId((cur) =>
        cur && list.some((w) => w.id === cur) ? cur : (list.find((w) => w.isDefault)?.id ?? list[0].id)
      )
    })
  }, [boot.data])

  // ---------------- payment state ----------------
  const [method, setMethod] = React.useState<PayMethod>('CASH')
  /** null → automatically follow the running total */
  const [paidOverride, setPaidOverride] = React.useState<string | null>(null)
  const [discStr, setDiscStr] = React.useState('')

  const discountValue = Math.max(0, Number.parseFloat(discStr) || 0)
  const taxPercent = boot.data?.org.taxPercent ?? 0
  const totals = React.useMemo(() => cartTotals(lines, discountValue, taxPercent), [lines, discountValue, taxPercent])
  const subtotal = totals.subtotal
  const effDiscount = Math.min(discountValue, subtotal)
  const taxAmount = round2Client(totals.total - (subtotal - effDiscount))
  const totalsTotal = totals.total

  const paidValue =
    paidOverride !== null && Number.isFinite(Number.parseFloat(paidOverride))
      ? Math.max(0, Number.parseFloat(paidOverride))
      : totalsTotal
  const remainingOnInvoice = Math.max(0, round2Client(totalsTotal - paidValue))
  const changeBack = Math.max(0, round2Client(paidValue - totalsTotal))

  // ---------------- customer popover ----------------
  const [custOpen, setCustOpen] = React.useState(false)
  const [custQ, setCustQ] = React.useState('')
  const customers = boot.data?.customers ?? []
  const filteredCustomers = React.useMemo(() => {
    const q = custQ.trim().toLowerCase()
    if (!q) return customers.slice(0, 50)
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
      .slice(0, 50)
  }, [customers, custQ])

  function pickCustomer(id: string | null, name: string) {
    useCart.getState().setCustomer(id, id ? name : '')
    setCustOpen(false)
    setCustQ('')
  }

  // ---------------- cart ops ----------------
  function addToCart(p: PosProduct, qty = 1) {
    useCart.getState().addLine({
      productId: p.id,
      name: p.name,
      price: p.price,
      qty,
      barcode: p.barcode,
      unitShort: p.unitShort ?? null,
    })
    setFlash({ id: p.id, k: Date.now() })
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const v = search.trim()
    if (!v) return
    const exact = allProducts.find((p) => p.barcode === v)
    if (exact) {
      addToCart(exact)
      setSearch('')
      return
    }
    if (visibleProducts.length === 1) {
      addToCart(visibleProducts[0])
      setSearch('')
    }
    // otherwise: keep the suggestion grid showing all matches
  }

  // ---------------- qty drafts ----------------
  const [qtyDrafts, setQtyDrafts] = React.useState<Record<string, string>>({})

  function commitQty(productId: string) {
    const raw = qtyDrafts[productId]
    const v = Number.parseFloat(raw ?? '')
    if (Number.isFinite(v) && v > 0) useCart.getState().setQty(productId, round2Client(v))
    else if (Number.isFinite(v) && v <= 0) useCart.getState().removeLine(productId)
    setQtyDrafts((d) => {
      const next = { ...d }
      delete next[productId]
      return next
    })
  }

  // ---------------- submit ----------------
  const [busy, setBusy] = React.useState(false)
  const [success, setSuccess] = React.useState<SuccessState | null>(null)

  async function checkout() {
    if (busy || success) return
    if (lines.length === 0) {
      toast.error(t('pos.errNoItems'))
      return
    }
    setBusy(true)
    try {
      const res = await requestJson<CreatedInvoice>('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          type: 'SALE',
          customerId: customerId ?? undefined,
          warehouseId: whId || undefined,
          items: lines.map((l) => ({ productId: l.productId, qty: l.qty, price: l.price })),
          discount: discountValue || undefined,
          paidAmount: round2Client(Math.min(paidValue, totalsTotal)),
          paidMethod: method,
        }),
      })
      if (res.warnings?.length) {
        toast.warning(t('sales.soldBeyondStock', { names: res.warnings.join('، ') }))
      }
      resetSaleState()
      setSuccess({
        id: res.id,
        number: res.number,
        status: res.status,
        total: res.total,
        paid: round2Client(Math.min(paidValue, totalsTotal)),
        method,
        queued: false,
      })
      void boot.refetch() // stock badges catch up after the sale
    } catch (err) {
      if (err instanceof ApiError && err.queued) {
        toast.info(t('common.savedOffline'))
        resetSaleState()
        setSuccess({
          id: '',
          number: 0,
          status: 'QUEUED',
          total: totalsTotal,
          paid: 0,
          method,
          queued: true,
        })
      } else {
        toast.error(t('common.error'))
      }
    } finally {
      setBusy(false)
    }
  }

  function resetSaleState() {
    useCart.getState().clear()
    setPaidOverride(null)
    setDiscStr('')
    setQtyDrafts({})
    setCartSheetOpen(false)
  }

  function openInvoiceInSales() {
    if (!success?.id) return
    try {
      sessionStorage.setItem('tijara-open-invoice', success.id)
    } catch {}
    setSuccess(null)
    setView('sales')
  }

  const checkoutRef = React.useRef(checkout)
  checkoutRef.current = checkout

  // F2 completes the sale while this screen is mounted
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault()
        void checkoutRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---------------- cart panel content (shared desktop aside / mobile sheet) ----------------
  const itemsWord = lines.length === 1 ? t('common.item') : t('common.items')

  const cartContent = (
    <div className="space-y-3">
      {/* customer */}
      <div className="flex items-center gap-1.5">
        {/* modal popover: non-modal popovers cannot open over the mobile cart
            Sheet (Radix Dialog modal layer — content is portaled outside the
            sheet, so the touch never reaches it) → customers unreachable on phones */}
        <Popover open={custOpen} onOpenChange={setCustOpen} modal>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={custOpen}
              className="h-10 flex-1 justify-between gap-2 font-normal"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    customerId ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {customerId ? initials(customerName) : <UserRound className="size-3.5" aria-hidden />}
                </span>
                <span className="truncate">{customerName || t('common.walkIn')}</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[320px] max-w-[85vw] p-0">
            <div className="border-b p-2">
              <Input
                value={custQ}
                onChange={(e) => setCustQ(e.target.value)}
                placeholder={t('pos.custSearchPh')}
                className="h-9"
              />
            </div>
            <div className="max-h-64 overflow-y-auto scrollbar-thin p-1">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                onClick={() => pickCustomer(null, '')}
              >
                <UserRound className="size-4 text-muted-foreground" aria-hidden />
                {t('pos.walkInReset')}
              </button>
              {filteredCustomers.length > 0 ? <div className="my-1 border-t" /> : null}
              {filteredCustomers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickCustomer(c.id, c.name)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent',
                    c.id === customerId && 'bg-accent/60'
                  )}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    {initials(c.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-start">{c.name}</span>
                  {c.phone ? (
                    <span dir="ltr" className="num-ltr shrink-0 text-xs text-muted-foreground tabular-nums">
                      {c.phone}
                    </span>
                  ) : null}
                  {c.id === customerId ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
                </button>
              ))}
              {filteredCustomers.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">{t('pos.noCustomers')}</p>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
        {customerId ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            aria-label={t('pos.clearCustomer')}
            title={t('pos.clearCustomer')}
            onClick={() => useCart.getState().setCustomer(null, '')}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      {/* lines */}
      <div className="rounded-xl border">
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
          <h2 className="text-sm font-semibold">{t('pos.cartTitle')}</h2>
          <span dir="ltr" className="num-ltr text-xs text-muted-foreground tabular-nums">
            {itemsWord} · {num(lines.length, 0)}
          </span>
        </div>
        {lines.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <ShoppingBasket className="mx-auto mb-2 size-8 text-muted-foreground/40" aria-hidden />
            <p className="text-sm font-medium">{t('pos.cartEmpty')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('pos.cartEmptyHint')}</p>
          </div>
        ) : (
          <ul className="max-h-[40vh] divide-y overflow-y-auto scrollbar-thin">
            {lines.map((l) => (
              <li key={l.productId} className="flex items-center gap-2 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={l.name}>
                    {l.name}
                  </p>
                  <p dir="ltr" className="num-ltr text-start text-[11px] text-muted-foreground tabular-nums">
                    ×{num(l.price)}
                    {l.unitShort ? ` ${l.unitShort}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7"
                    aria-label={t('pos.qtyMinus', { name: l.name })}
                    disabled={busy}
                    onClick={() => useCart.getState().decLine(l.productId)}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    dir="ltr"
                    className="num-ltr h-8 w-14 px-1.5 text-center text-sm tabular-nums"
                    aria-label={t('pos.qtyInput', { name: l.name })}
                    value={qtyDrafts[l.productId] ?? String(l.qty)}
                    onChange={(e) => setQtyDrafts((d) => ({ ...d, [l.productId]: e.target.value }))}
                    onBlur={() => commitQty(l.productId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7"
                    aria-label={t('pos.qtyPlus', { name: l.name })}
                    disabled={busy}
                    onClick={() => useCart.getState().incLine(l.productId)}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
                <span
                  dir="ltr"
                  className="num-ltr w-[5.5rem] shrink-0 text-end text-sm font-semibold tabular-nums"
                >
                  {money(round2Client(l.qty * l.price))}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={t('pos.removeItem', { name: l.name })}
                  disabled={busy}
                  onClick={() => useCart.getState().removeLine(l.productId)}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* warehouse */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">{t('pos.warehouseLabel')}</p>
        <Select value={whId || undefined} onValueChange={setWhId}>
          <SelectTrigger className="h-9 w-full" aria-label={t('pos.warehouseLabel')}>
            <SelectValue placeholder={t('common.warehouse')} />
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

      {/* totals */}
      <div className="space-y-2 rounded-xl bg-muted/50 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-muted-foreground">{t('common.subtotal')}</span>
          <span dir="ltr" className="num-ltr text-sm font-medium tabular-nums">
            {money(subtotal)}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <span className="text-sm text-muted-foreground">{t('common.discount')}</span>
          <div className="flex flex-wrap items-center gap-1">
            {[5, 10].map((pct) => (
              <Button
                key={pct}
                type="button"
                variant="secondary"
                className="h-7 rounded-full px-2.5 text-[11px]"
                disabled={!lines.length}
                onClick={() => setDiscStr(String(round2Client(subtotal * (pct / 100))))}
              >
                {t('pos.discPct', { p: pct })}
              </Button>
            ))}
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              dir="ltr"
              className="num-ltr h-7 w-20 px-1.5 text-end text-xs tabular-nums"
              aria-label={t('common.discount')}
              placeholder="0"
              value={discStr}
              onChange={(e) => setDiscStr(e.target.value)}
            />
            {discStr ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                aria-label={t('common.reset')}
                onClick={() => setDiscStr('')}
              >
                <X className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {taxPercent > 0 ? t('pos.taxPct', { p: num(taxPercent, 2) }) : t('common.tax')}
          </span>
          <span dir="ltr" className="num-ltr text-sm font-medium tabular-nums">
            {money(taxAmount)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t pt-2">
          <span className="font-semibold">{t('common.total')}</span>
          <span dir="ltr" className="num-ltr text-xl font-extrabold tabular-nums text-primary">
            {money(totalsTotal)}
          </span>
        </div>
      </div>

      {/* payment */}
      <div className="space-y-2.5 rounded-xl border p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t('common.method')}</label>
            <Select
              value={method}
              onValueChange={(v) => {
                setMethod(v as PayMethod)
                setPaidOverride(null) // re-prefill with full total
              }}
            >
              <SelectTrigger className="h-9 w-full" aria-label={t('common.method')}>
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
            <label className="text-xs text-muted-foreground">{t('pos.paidAtCheckout')}</label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              dir="ltr"
              className="num-ltr h-9 text-start tabular-nums"
              aria-label={t('pos.paidAtCheckout')}
              value={paidOverride ?? String(round2Client(totalsTotal))}
              onChange={(e) => setPaidOverride(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" aria-label={t('pos.quickCash')}>
          <span className="text-[11px] text-muted-foreground">{t('pos.quickCash')}</span>
          {QUICK_CASH.map((denom) => (
            <Button
              key={denom}
              type="button"
              variant="secondary"
              dir="ltr"
              className="h-7 rounded-full px-2.5 text-[11px] tabular-nums"
              disabled={!lines.length}
              onClick={() => setPaidOverride(String(round2Client(paidValue + denom)))}
            >
              +{denom}
            </Button>
          ))}
          <Button
            type="button"
            variant="secondary"
            className="h-7 rounded-full px-2.5 text-[11px]"
            disabled={!lines.length}
            onClick={() => setPaidOverride(null)}
          >
            {t('pos.fullAmount')}
          </Button>
        </div>

        {remainingOnInvoice > 0.009 && lines.length > 0 ? (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-amber-600 dark:text-amber-400">{t('pos.remainingInvoice')}</span>
            <span
              dir="ltr"
              className="num-ltr text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400"
            >
              {money(remainingOnInvoice)}
            </span>
          </div>
        ) : null}
        {changeBack > 0.009 && lines.length > 0 ? (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-emerald-600 dark:text-emerald-400">{t('pos.changeBack')}</span>
            <span
              dir="ltr"
              className="num-ltr text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400"
            >
              {money(changeBack)}
            </span>
          </div>
        ) : null}
      </div>

      {/* submit */}
      <Button
        className="h-12 w-full text-lg font-bold"
        disabled={busy || lines.length === 0 || !!success}
        onClick={() => void checkout()}
      >
        {busy ? (
          <>
            <Loader2 className="size-5 animate-spin" aria-hidden />
            {t('pos.submitting')}
          </>
        ) : (
          <>
            <Check className="size-5" aria-hidden />
            {t('pos.checkout')}
          </>
        )}
      </Button>
      {!onlineState ? (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <WifiOff className="size-3.5" aria-hidden />
          {t('common.offlineHint')}
        </p>
      ) : null}
    </div>
  )

  // ---------------- render ----------------
  const loading = boot.loading && !boot.data
  const failed = !!boot.error && !boot.data

  return (
    <div className="pb-28 lg:pb-0">
      <PageHeader
        title={t('nav.pos')}
        subtitle={t('pos.subtitle')}
        icon={<ScanLine className="size-5" aria-hidden />}
        actions={<PosSyncPill />}
      />

      {failed ? (
        <EmptyState
          icon={PackageX}
          title={t('common.error')}
          action={
            <Button variant="outline" onClick={boot.refetch}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          {/* -------------- products side -------------- */}
          <section className="min-w-0 space-y-3">
            {/* search + barcode wedge */}
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 start-3 z-10 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={t('pos.searchPh')}
                aria-label={t('pos.searchPh')}
                className="h-11 ps-9 pe-10 text-base"
              />
              {search ? (
                <button
                  type="button"
                  className="absolute top-1/2 end-2 z-10 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={t('pos.searchClear')}
                  onClick={() => setSearch('')}
                >
                  <X className="size-4" />
                </button>
              ) : (
                <ScanLine
                  className="pointer-events-none absolute top-1/2 end-3 z-10 size-4 -translate-y-1/2 text-muted-foreground/60"
                  aria-hidden
                />
              )}
            </div>

            {/* category chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin" aria-label={t('common.category')}>
              <Button
                variant={catId === '' ? 'default' : 'outline'}
                className="h-8 shrink-0 rounded-full px-3.5 text-xs"
                onClick={() => setCatId('')}
              >
                {t('pos.catAll')}
              </Button>
              {categories.map((c) => (
                <Button
                  key={c.id}
                  variant={catId === c.id ? 'default' : 'outline'}
                  className="h-8 shrink-0 rounded-full px-3.5 text-xs"
                  onClick={() => setCatId(catId === c.id ? '' : c.id)}
                >
                  {c.name}
                </Button>
              ))}
            </div>

            {/* product grid */}
            {loading ? (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4" aria-busy>
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-[128px] rounded-xl" />
                ))}
              </div>
            ) : visibleProducts.length === 0 ? (
              <EmptyState icon={PackageX} title={t('common.noData')} />
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                {visibleProducts.map((p) => {
                  const badge = stockBadge(p)
                  const flashing = flash?.id === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addToCart(p)}
                      aria-label={`${p.name} · ${money(p.price)}`}
                      className={cn(
                        'relative flex flex-col items-stretch gap-1.5 rounded-xl border bg-card p-2.5 text-start shadow-sm transition-all duration-150',
                        'hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        flashing && 'scale-[1.03] ring-2 ring-primary'
                      )}
                    >
                      <div className="flex w-full items-start justify-between gap-1.5">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={t('pos.productImgAlt', { name: p.name })}
                            className="size-10 shrink-0 rounded-lg object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        ) : (
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground/60">
                            <Package className="size-5" aria-hidden />
                          </span>
                        )}
                        {badge ? (
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                              badge.cls
                            )}
                            title={
                              badge.out
                                ? t('pos.outOfStock')
                                : t('pos.inStockAria', { n: num(p.stock ?? 0) })
                            }
                          >
                            {badge.out ? t('pos.outOfStock') : num(p.stock ?? 0)}
                          </span>
                        ) : null}
                      </div>
                      <p className="line-clamp-2 min-h-8 text-xs font-medium leading-snug">{p.name}</p>
                      <span
                        dir="ltr"
                        className="num-ltr mt-auto text-start text-sm font-extrabold tabular-nums text-primary"
                      >
                        {money(p.price)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* -------------- cart panel (desktop end side) -------------- */}
          {cartOnAside ? (
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100dvh-6.5rem)] space-y-3 overflow-y-auto scrollbar-thin rounded-2xl border bg-background p-3 shadow-sm">
              {cartContent}
            </div>
          </aside>
          ) : null}
        </div>
      )}

      {/* -------------- mobile sticky summary bar -------------- */}
      {!failed ? (
        <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
          <div className="border-t bg-background/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-6px_20px_rgba(0,0,0,0.08)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="mx-auto flex max-w-screen-2xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-muted-foreground">
                  {customerName || t('common.walkIn')} · {itemsWord} {num(lines.length, 0)}
                </p>
                <p dir="ltr" className="num-ltr truncate text-base font-extrabold tabular-nums text-primary">
                  {money(totalsTotal)}
                </p>
              </div>
              <Button
                className="h-11 min-w-36"
                disabled={lines.length === 0}
                onClick={() => setCartSheetOpen(true)}
              >
                <ShoppingBasket className="size-4" aria-hidden />
                {t('pos.viewCart')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* -------------- mobile cart sheet (mounted below lg only — see cartOnAside) -------------- */}
      {!cartOnAside ? (
      <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
        <SheetContent side="bottom" className="h-[90dvh] gap-0 p-0">
          <SheetHeader className="border-b">
            <SheetTitle>{t('pos.cartTitle')}</SheetTitle>
            <SheetDescription className="sr-only">{t('pos.subtitle')}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4">{cartContent}</div>
        </SheetContent>
      </Sheet>
      ) : null}

      {/* -------------- success dialog -------------- */}
      <Dialog open={!!success} onOpenChange={(o) => !o && setSuccess(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="items-center text-center sm:text-center">
            <div
              className={cn(
                'mx-auto mb-1 flex size-16 items-center justify-center rounded-full',
                success?.queued
                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300'
              )}
            >
              {success?.queued ? (
                <WifiOff className="size-8" aria-hidden />
              ) : (
                <Check className="size-9" aria-hidden />
              )}
            </div>
            <DialogTitle className="text-xl">
              {success?.queued ? t('pos.savedOfflineTitle') : t('pos.successTitle')}
            </DialogTitle>
            <DialogDescription>
              {success?.queued ? t('pos.savedOfflineHint') : t(`common.status.${success?.status ?? ''}`)}
            </DialogDescription>
          </DialogHeader>

          {success ? (
            <div className="my-1 flex flex-col items-center gap-1.5">
              {!success.queued ? (
                <span
                  dir="ltr"
                  className="num-ltr rounded-lg bg-primary/10 px-4 py-1.5 text-lg font-extrabold tracking-wide text-primary tabular-nums"
                >
                  {fmtDoc('INV', success.number)}
                </span>
              ) : null}
              <span dir="ltr" className="num-ltr text-2xl font-extrabold tabular-nums">
                {money(success.total)}
              </span>
              {!success.queued ? (
                <p className="text-xs text-muted-foreground">
                  {t('common.paid')}:{' '}
                  <span dir="ltr" className="num-ltr font-semibold tabular-nums">
                    {money(success.paid)}
                  </span>{' '}
                  · {t(`common.method.${success.method}`)}
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-center">
            {success && !success.queued && onlineState ? (
              <>
                <Button variant="outline" onClick={() => void printPaper(success.id, 'A4')}>
                  <Printer className="size-4" aria-hidden />
                  {t('pos.printA4')}
                </Button>
                <Button variant="outline" onClick={() => void printPaper(success.id, '80mm')}>
                  <Printer className="size-4" aria-hidden />
                  {t('pos.printThermal80')}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10"
                      aria-label={t('pos.printMoreSizes')}
                      title={t('pos.printMoreSizes')}
                    >
                      <MoreHorizontal className="size-4" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center">
                    <DropdownMenuItem onClick={() => void printPaper(success.id, '58mm')}>
                      {t('pos.printThermal58')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
            <div className="grid w-full grid-cols-2 gap-2 sm:col-span-full">
              <Button className="h-11" onClick={() => setSuccess(null)}>
                <Plus className="size-4" aria-hidden />
                {t('pos.newSale')}
              </Button>
              {success && !success.queued ? (
                <Button variant="outline" className="h-11" onClick={openInvoiceInSales}>
                  {t('pos.viewInvoice')}
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

async function printPaper(invoiceId: string, paper: PaperKind) {
  const { printDoc } = await import('@/lib/print/client')
  void printDoc('invoice', invoiceId, { paper })
}
