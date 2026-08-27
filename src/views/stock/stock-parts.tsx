'use client'

/**
 * Shared internal building blocks for the Warehouses & Stock view.
 * Used ONLY by src/views/stock/WarehousesView.tsx (same task owner).
 */

import * as React from 'react'
import { Loader2, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/lib/i18n'
import type {
  CategoryDTO,
  OrgDTO,
  ProductDTO,
  SessionUser,
  UnitDTO,
  WarehouseDTO,
} from '@/lib/types'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------- DTOs

/** Slimmed bootstrap shape — only the pieces this module consumes. */
export interface BootstrapShape {
  user: SessionUser
  org: OrgDTO
  categories: CategoryDTO[]
  units: UnitDTO[]
  warehouses: WarehouseDTO[]
  products: ProductDTO[]
}

export interface WarehouseRow extends WarehouseDTO {
  levelCount?: number
}

export interface TransferRow {
  id: string
  number: number
  fromName: string
  toName: string
  note: string | null
  createdBy: string | null
  date: string
  itemCount: number
  items: Array<{ productId: string; productName: string; qty: number }>
}

// ---------------------------------------------------------------- pure helpers

/** Quantity of a product inside one warehouse (0 when no level row). */
export function qtyOf(p: ProductDTO, warehouseId: string): number {
  return p.levels.find((l) => l.warehouseId === warehouseId)?.qty ?? 0
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function isLowStock(p: ProductDTO, total: number): boolean {
  return p.minQty > 0 && total <= p.minQty
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function yyyymmdd(d = new Date()): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}

type CsvCell = string | number | null | undefined

/** Build + trigger a client-side CSV download with a UTF-8 BOM (Excel Arabic friendly). */
export function downloadCsv(filename: string, rows: CsvCell[][]): void {
  const esc = (v: CsvCell): string => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  const csv = '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Filter products by a search term: matches that START with the term on
 * name/barcode rank first, then contains-matches.
 */
export function matchProducts(products: ProductDTO[], term: string, limit = 8): ProductDTO[] {
  const q = term.trim().toLowerCase()
  if (!q) return []
  const starts: ProductDTO[] = []
  const contains: ProductDTO[] = []
  for (const p of products) {
    const name = p.name.toLowerCase()
    const barcode = (p.barcode ?? '').toLowerCase()
    if (name.startsWith(q) || barcode.startsWith(q)) starts.push(p)
    else if (name.includes(q) || barcode.includes(q) || (p.sku ?? '').toLowerCase().includes(q))
      contains.push(p)
  }
  return [...starts, ...contains].slice(0, limit)
}

// ---------------------------------------------------------------- hooks

/** Debounce any fast-changing value (search inputs). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState<T>(value)
  React.useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return v
}

// ---------------------------------------------------------------- small presentational parts

/** Colored badge for a movement kind. */
const KIND_TONES: Record<string, string> = {
  SALE: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  PURCHASE:
    'border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
  TRANSFER_IN:
    'border-transparent bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
  TRANSFER_OUT:
    'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  ADJUST_IN:
    'border-transparent bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  ADJUST_OUT:
    'border-transparent bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
  OPENING:
    'border-transparent bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  SALE_CANCEL:
    'border-transparent bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300',
  PURCHASE_CANCEL:
    'border-transparent bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
}

export function KindChip({ kind }: { kind: string }) {
  const { t } = useI18n()
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', KIND_TONES[kind] ?? '')}>
      {t(`stock.kind.${kind}`)}
    </Badge>
  )
}

/** Signed quantity: emerald +n for inflows, red −n for outflows. */
export function SignedQty({ qty, className }: { qty: number; className?: string }) {
  const { num } = useI18n()
  const sign = qty > 0 ? '+' : qty < 0 ? '\u2212' : ''
  return (
    <span
      dir="ltr"
      className={cn(
        'num-ltr inline-block font-semibold tabular-nums whitespace-nowrap',
        qty === 0 ? 'text-muted-foreground' : qty > 0 ? 'text-emerald-600' : 'text-destructive',
        className
      )}
    >
      {sign}
      {num(Math.abs(qty))}
    </span>
  )
}

// ---------------------------------------------------------------- product combobox

/**
 * Lightweight product autocomplete used by Transfers and Stocktake Adjustment.
 * Plain input + absolutely positioned suggestion list (stable across RTL/LTR).
 */
export function ProductPicker({
  products,
  placeholder,
  emptyLabel,
  onPick,
  autoFocus = false,
}: {
  products: ProductDTO[]
  placeholder: string
  emptyLabel: string
  onPick: (p: ProductDTO) => void
  autoFocus?: boolean
}) {
  const { t } = useI18n()
  const [term, setTerm] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const results = React.useMemo(() => matchProducts(products, term), [products, term])

  React.useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])

  function pick(p: ProductDTO) {
    onPick(p)
    setTerm('')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 start-2.5 z-10 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={term}
          autoFocus={autoFocus}
          onChange={(e) => {
            setTerm(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Enter') {
              e.preventDefault()
              if (results[0]) pick(results[0])
            }
          }}
          placeholder={placeholder}
          className="ps-8"
          autoComplete="off"
          aria-autocomplete="list"
        />
      </div>
      {open ? (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto scrollbar-thin rounded-md border bg-popover text-popover-foreground shadow-md">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">{emptyLabel}</p>
          ) : (
            <ul role="listbox" aria-label={t('stock.pickProduct')}>
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    // onMouseDown keeps focus in the input so click survives blur ordering
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pick(p)
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="truncate font-medium">{p.name}</span>
                    {p.barcode ? (
                      <span dir="ltr" className="num-ltr shrink-0 font-mono text-xs text-muted-foreground">
                        {p.barcode}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- tiny loading row

export function InlineSpinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" aria-hidden />
      {label}
    </span>
  )
}
