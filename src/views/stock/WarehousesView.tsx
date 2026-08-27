'use client'

/**
 * Warehouses & Stock control center (Task 2-c).
 * Tabs: Stock Levels · Warehouses · Transfers · Movement Log · Stocktake Adjustment.
 * Source of truth: GET /api/bootstrap (+ /api/warehouses, /api/transfers, /api/stock/*).
 */

import * as React from 'react'
import {
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
  Download,
  History,
  Info,
  Lock,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RotateCw,
  SendHorizontal,
  Star,
  Trash2,
  TriangleAlert,
  Warehouse,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import PageHeader from '@/components/shared/page-header'
import StatCard from '@/components/shared/stat-card'
import EmptyState from '@/components/shared/empty-state'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'
import { useSession } from '@/stores/session'
import { ApiError, useApi, requestJson } from '@/hooks/use-api'
import type { CategoryDTO, MovementDTO, ProductDTO, WarehouseDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  BootstrapShape,
  InlineSpinner,
  KindChip,
  ProductPicker,
  SignedQty,
  TransferRow,
  WarehouseRow,
  downloadCsv,
  isLowStock,
  qtyOf,
  round2,
  useDebounced,
  yyyymmdd,
} from './stock-parts'

type TabKey = 'levels' | 'warehouses' | 'transfers' | 'movements' | 'adjust'

// ============================================================ levels tab

interface RowWithTotal {
  p: ProductDTO
  total: number
}

function QtyCell({ qty, minQty, bold = false }: { qty: number; minQty: number; bold?: boolean }) {
  const low = minQty > 0 && qty <= minQty
  return (
    <td
      className={cn(
        'p-2 text-center align-middle text-sm num-ltr',
        bold && 'font-bold',
        low ? 'font-semibold text-red-600 dark:text-red-400' : '',
        !low && qty > 0 ? 'bg-emerald-50 dark:bg-emerald-950/40' : ''
      )}
    >
      <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap">
        {low ? <TriangleAlert className="size-3.5" aria-hidden /> : null}
        {qty}
      </span>
    </td>
  )
}

function LevelsTab({
  data,
}: {
  data: BootstrapShape | undefined
}) {
  const { t, money, num } = useI18n()
  const products = data?.products ?? []
  const warehouses: WarehouseDTO[] = data?.warehouses ?? []
  const categories: CategoryDTO[] = data?.categories ?? []

  const [whFilter, setWhFilter] = React.useState('all')
  const [catFilter, setCatFilter] = React.useState('all')
  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [showOnlyLow, setShowOnlyLow] = React.useState(false)

  const visibleCols = React.useMemo(() => warehouses.slice(0, 3), [warehouses])
  const extraCols = React.useMemo(() => warehouses.slice(3), [warehouses])

  const rows: RowWithTotal[] = React.useMemo(() => {
    let list = products
    if (catFilter !== 'all') list = list.filter((p) => p.categoryId === catFilter)
    const q = debouncedSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q)
      )
    }
    if (whFilter !== 'all') list = list.filter((p) => qtyOf(p, whFilter) !== 0)
    let mapped: RowWithTotal[] = list.map((p) => ({
      p,
      total: p.levels.reduce((s, l) => s + l.qty, 0),
    }))
    if (showOnlyLow) mapped = mapped.filter((r) => isLowStock(r.p, r.total))
    return [...mapped].sort((a, b) => a.p.name.localeCompare(b.p.name))
  }, [products, catFilter, debouncedSearch, whFilter, showOnlyLow])

  // stats respect the warehouse scope
  const stats = React.useMemo(() => {
    let qtySum = 0
    let value = 0
    for (const r of rows) {
      const scoped = whFilter === 'all' ? r.total : qtyOf(r.p, whFilter)
      qtySum += scoped
      value += scoped * r.p.cost
    }
    return { count: rows.length, qtySum, value }
  }, [rows, whFilter])

  function exportCsv() {
    const header: string[] = [
      t('common.code'),
      t('common.name'),
      ...visibleCols.map((w) => w.name),
      ...(extraCols.length > 0 ? [t('stock.colOther', { n: extraCols.length })] : []),
      t('common.total'),
      t('stock.colMinQty'),
      t('common.cost'),
      t('stock.colValue'),
    ]
    const body = rows.map((r): Array<string | number> => [
      r.p.sku || r.p.barcode || '',
      r.p.name,
      ...visibleCols.map((w) => qtyOf(r.p, w.id)),
      ...(extraCols.length > 0
        ? [extraCols.reduce((s, w) => s + qtyOf(r.p, w.id), 0)]
        : []),
      r.total,
      r.p.minQty,
      round2(r.p.cost),
      round2(r.total * r.p.cost),
    ])
    downloadCsv(`tijara-stock-${yyyymmdd()}.csv`, [header, ...body])
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full max-w-3xl" />
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
        <span className="sr-only">{t('stock.loadingMatrix')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* controls row */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={whFilter} onValueChange={setWhFilter}>
          <SelectTrigger className="w-full sm:w-[190px]" aria-label={t('common.warehouse')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.allWarehouses')}</SelectItem>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-full sm:w-[190px]" aria-label={t('common.category')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('stock.allCategories')}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('stock.searchPh')}
          className="w-full sm:max-w-xs"
        />

        <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm select-none hover:bg-accent/50">
          <Checkbox checked={showOnlyLow} onCheckedChange={(v) => setShowOnlyLow(v === true)} />
          {t('stock.showOnlyLow')}
        </label>

        <div className="ms-auto">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="size-4" aria-hidden />
            {t('stock.exportCsv')}
          </Button>
        </div>
      </div>

      {/* mini stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={t('stock.statProducts')} value={num(stats.count, 0)} icon={Boxes} />
        <StatCard label={t('stock.statTotalQty')} value={num(stats.qtySum)} icon={ArrowLeftRight} tone="info" />
        <StatCard label={t('stock.statValue')} value={money(stats.value)} icon={Warehouse} tone="success" />
      </div>

      {/* desktop matrix */}
      <div className="hidden md:block">
        {rows.length === 0 ? (
          <EmptyState icon={Boxes} title={t('stock.noMatch')} hint={t('stock.legendLow')} />
        ) : (
          <div className="max-h-[560px] overflow-auto scrollbar-thin rounded-lg border bg-card">
            <Table>
              <TableHeader className="sticky top-0 z-[1]">
                <TableRow className="bg-muted/70 backdrop-blur hover:bg-muted/70">
                  <TableHead className="text-start min-w-[180px]">{t('stock.colProduct')}</TableHead>
                  {visibleCols.map((w) => (
                    <TableHead key={w.id} className="text-center">
                      {w.name}
                    </TableHead>
                  ))}
                  {extraCols.length > 0 ? (
                    <TableHead className="text-center">{t('stock.colOther', { n: extraCols.length })}</TableHead>
                  ) : null}
                  <TableHead className="text-center">{t('common.total')}</TableHead>
                  <TableHead className="text-center">{t('stock.colMinQty')}</TableHead>
                  <TableHead className="text-end">{t('stock.colValue')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ p, total }) => (
                  <StockRow
                    key={p.id}
                    product={p}
                    total={total}
                    visibleCols={visibleCols}
                    extraCols={extraCols}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t('stock.legendLow')}
        </p>
      </div>

      {/* mobile condensed cards */}
      <div className="md:hidden">
        {rows.length === 0 ? (
          <EmptyState icon={Boxes} title={t('stock.noMatch')} />
        ) : (
          <div className="max-h-[560px] space-y-2 overflow-auto scrollbar-thin pe-0.5">
            {rows.map(({ p, total }) => {
              const top = [...p.levels].sort((a, b) => Math.abs(b.qty) - Math.abs(a.qty))[0]
              const topName = top ? warehouses.find((w) => w.id === top.warehouseId)?.name ?? '' : ''
              return (
                <Card key={p.id} className="py-0 shadow-sm">
                  <CardContent className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{p.name}</p>
                        {p.barcode ? (
                          <p dir="ltr" className="num-ltr font-mono text-xs text-muted-foreground">
                            {p.barcode}
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-end">
                        <p
                          className={cn(
                            'num-ltr text-lg font-bold',
                            isLowStock(p, total) ? 'text-red-600 dark:text-red-400' : ''
                          )}
                        >
                          {total}
                        </p>
                        {isLowStock(p, total) ? (
                          <Badge variant="outline" className="border-transparent bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">
                            {t('stock.lowFlag')}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    {topName ? (
                      <p className="mt-1.5 truncate text-xs text-muted-foreground">
                        {t('stock.mobileTopWh', { name: topName })}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('stock.colValue')}: {money(total * p.cost)}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function StockRow({
  product,
  total,
  visibleCols,
  extraCols,
}: {
  product: ProductDTO
  total: number
  visibleCols: WarehouseDTO[]
  extraCols: WarehouseDTO[]
}) {
  const { money } = useI18n()
  const otherQty = extraCols.reduce((s, w) => s + qtyOf(product, w.id), 0)
  return (
    <TableRow className="hover:bg-muted/40">
      <TableCell className="align-middle">
        <p className="max-w-[260px] truncate font-medium">{product.name}</p>
        {product.barcode ? (
          <p dir="ltr" className="num-ltr font-mono text-xs text-muted-foreground">
            {product.barcode}
          </p>
        ) : null}
      </TableCell>
      {visibleCols.map((w) => (
        <QtyCell key={w.id} qty={qtyOf(product, w.id)} minQty={product.minQty} />
      ))}
      {extraCols.length > 0 ? <QtyCell qty={otherQty} minQty={product.minQty} /> : null}
      <QtyCell qty={total} minQty={product.minQty} bold />
      <td className="p-2 text-center align-middle text-sm text-muted-foreground num-ltr tabular-nums">
        {product.minQty > 0 ? product.minQty : '—'}
      </td>
      <td className="p-2 text-end align-middle text-sm tabular-nums whitespace-nowrap">
        {money(round2(total * product.cost))}
      </td>
    </TableRow>
  )
}

// ============================================================ warehouses tab

function WarehousesTab({
  boot,
  refetchBoot,
  staff,
}: {
  boot: BootstrapShape | undefined
  refetchBoot: () => void
  staff: boolean
}) {
  const { t, money, num } = useI18n()
  const listApi = useApi<WarehouseRow[]>('/api/warehouses')
  const rows = listApi.data ?? []
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<WarehouseRow | null>(null)
  const [deleting, setDeleting] = React.useState<WarehouseRow | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  // per-warehouse aggregates computed from bootstrap levels × cost
  const agg = React.useMemo(() => {
    const map = new Map<string, { qty: number; value: number }>()
    for (const p of boot?.products ?? []) {
      for (const l of p.levels) {
        const cur = map.get(l.warehouseId) ?? { qty: 0, value: 0 }
        cur.qty += l.qty
        cur.value += l.qty * p.cost
        map.set(l.warehouseId, cur)
      }
    }
    return map
  }, [boot?.products])

  async function makeDefault(w: WarehouseRow) {
    setBusyId(w.id)
    try {
      await requestJson(`/api/warehouses/${w.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isDefault: true }),
      })
      toast.success(t('common.updated'))
      void listApi.refetch()
      refetchBoot()
    } catch (e) {
      toast.error(e instanceof ApiError && e.queued ? t('common.savedOffline') : t('common.error'))
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    const w = deleting
    if (!w) return
    setBusyId(w.id)
    try {
      await requestJson(`/api/warehouses/${w.id}`, { method: 'DELETE' })
      toast.success(t('common.deleted'))
      setDeleting(null)
      void listApi.refetch()
      refetchBoot()
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.queued) toast(t('common.savedOffline'))
        else if (e.message === 'cannot-delete-default') toast.error(t('stock.errDefault'))
        else if (e.message === 'in-use') toast.error(t('stock.errInUse'))
        else toast.error(t('common.error'))
      } else toast.error(t('common.error'))
      setDeleting(null)
    } finally {
      setBusyId(null)
    }
  }

  if (listApi.loading && rows.length === 0) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {staff ? (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" aria-hidden />
            {t('stock.addWarehouse')}
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={Warehouse} title={t('common.noData')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((w) => {
            const a = agg.get(w.id) ?? { qty: 0, value: 0 }
            return (
              <Card key={w.id} className="py-0 shadow-sm transition-shadow hover:shadow-md">
                <CardContent className="flex h-full flex-col gap-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Warehouse className="size-5" aria-hidden />
                      </span>
                      <h3 className="truncate font-bold">{w.name}</h3>
                    </div>
                    {w.isDefault ? (
                      <Badge className="shrink-0 gap-1 border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300">
                        <Star className="size-3 fill-current" aria-hidden />
                        {t('stock.defaultBadge')}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="space-y-1.5 text-sm text-muted-foreground">
                    <p className="flex items-center gap-1.5 truncate">
                      <MapPin className="size-3.5 shrink-0" aria-hidden />
                      {w.location || <span className="italic opacity-70">{t('stock.noLocation')}</span>}
                    </p>
                    {w.phone ? (
                      <p dir="ltr" className="num-ltr flex items-center gap-1.5 text-start">
                        <Phone className="size-3.5 shrink-0" aria-hidden />
                        {w.phone}
                      </p>
                    ) : null}
                    <p className="flex items-center gap-1.5">
                      <Boxes className="size-3.5 shrink-0" aria-hidden />
                      {t('stock.itemsStored', { n: num(w.levelCount ?? 0, 0) })}
                    </p>
                  </div>

                  <div className="mt-auto grid grid-cols-2 gap-2 border-t pt-3">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('stock.totalOnHand')}</p>
                      <p className="num-ltr font-bold tabular-nums">{num(a.qty)}</p>
                    </div>
                    <div className="text-end">
                      <p className="text-xs text-muted-foreground">{t('stock.whValue')}</p>
                      <p className="num-ltr font-bold tabular-nums">{money(round2(a.value))}</p>
                    </div>
                  </div>

                  {staff ? (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setEditing(w)
                          setFormOpen(true)
                        }}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                        {t('common.edit')}
                      </Button>
                      {!w.isDefault ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={busyId === w.id}
                          onClick={() => makeDefault(w)}
                        >
                          <Star className="size-3.5" aria-hidden />
                          {t('stock.makeDefault')}
                        </Button>
                      ) : null}
                      <AlertDialog open={deleting?.id === w.id} onOpenChange={(o) => !o && setDeleting(null)}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          aria-label={t('common.delete')}
                          disabled={busyId === w.id}
                          onClick={() => setDeleting(w)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle>
                            <AlertDialogDescription>{w.name}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-white hover:bg-destructive/90"
                              onClick={(e) => {
                                e.preventDefault()
                                void confirmDelete()
                              }}
                            >
                              {t('common.delete')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <WarehouseFormDialog
        open={formOpen}
        editing={editing}
        onOpenChange={setFormOpen}
        onSaved={() => {
          void listApi.refetch()
          refetchBoot()
        }}
      />
    </div>
  )
}

function WarehouseFormDialog({
  open,
  editing,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  editing: WarehouseRow | null
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const [name, setName] = React.useState('')
  const [location, setLocation] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    void Promise.resolve().then(() => {
      setName(editing?.name ?? '')
      setLocation(editing?.location ?? '')
      setPhone(editing?.phone ?? '')
    })
  }, [open, editing])

  async function save() {
    if (!name.trim()) return
    setBusy(true)
    try {
      if (editing) {
        await requestJson(`/api/warehouses/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: name.trim(), location, phone }),
        })
        toast.success(t('common.updated'))
      } else {
        await requestJson('/api/warehouses', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), location, phone }),
        })
        toast.success(t('common.created'))
      }
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? t('stock.editWarehouse') : t('stock.addWarehouse')}</DialogTitle>
          <DialogDescription>{editing?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="wh-name">{t('stock.whName')} *</Label>
            <Input
              id="wh-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('stock.whNamePh')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh-location">{t('stock.whLocation')}</Label>
            <Input
              id="wh-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t('stock.whLocationPh')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh-phone">{t('common.phone')}</Label>
            <Input id="wh-phone" dir="ltr" className="num-ltr text-start" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
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

// ============================================================ transfers tab

const TRANSFER_PAGE = '/api/transfers?page=1&pageSize=8'

interface TransferList {
  total: number
  page: number
  pageSize: number
  rows: TransferRow[]
}

function TransfersTab({
  boot,
  refetchBoot,
}: {
  boot: BootstrapShape | undefined
  refetchBoot: () => void
}) {
  const { t, date, num } = useI18n()
  const warehouses = boot?.warehouses ?? []
  const recent = useApi<TransferList>(TRANSFER_PAGE)

  const [fromId, setFromId] = React.useState('')
  const [toId, setToId] = React.useState('')
  const [note, setNote] = React.useState('')
  const [picked, setPicked] = React.useState<Array<{ id: string; name: string; barcode: string | null; qty: string }>>([])
  const [busy, setBusy] = React.useState(false)

  const same = !!fromId && !!toId && fromId === toId
  const canSubmit = !!fromId && !!toId && !same && picked.length > 0 && !busy

  function pickProduct(p: ProductDTO) {
    setPicked((prev) =>
      prev.some((x) => x.id === p.id)
        ? prev
        : [...prev, { id: p.id, name: p.name, barcode: p.barcode, qty: '1' }]
    )
  }

  function resetForm() {
    setPicked([])
    setNote('')
  }

  async function submit() {
    const items = picked
      .map((x) => ({ productId: x.id, qty: round2(Number(x.qty) || 0) }))
      .filter((x) => x.qty > 0)
    if (items.length === 0) return
    setBusy(true)
    try {
      const res = await requestJson<{ id: string; number: number; itemCount: number }>('/api/transfers', {
        method: 'POST',
        body: JSON.stringify({ fromWarehouseId: fromId, toWarehouseId: toId, items, note: note.trim() || undefined }),
      })
      toast.success(t('stock.transferDone', { n: res.number }))
      resetForm()
      void recent.refetch()
      refetchBoot()
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.queued) toast.info(t('common.savedOffline'))
        else toast.error(t('common.error'))
      } else toast.error(t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <SendHorizontal className="size-4 text-primary" aria-hidden />
            {t('stock.tabTransfers')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* warehouse selects */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('stock.fromWh')}</Label>
              <Select value={fromId || undefined} onValueChange={setFromId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('stock.toWh')}</Label>
              <Select value={toId || undefined} onValueChange={setToId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {same ? (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {t('stock.sameWarehouse')}
            </p>
          ) : null}

          {/* item picker */}
          {!boot ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <ProductPicker
              products={boot.products.filter((p) => p.trackStock)}
              placeholder={t('stock.pickItems')}
              emptyLabel={t('stock.noSuggestions')}
              onPick={pickProduct}
            />
          )}

          {/* picked rows */}
          {picked.length > 0 ? (
            <ul className="divide-y overflow-hidden rounded-lg border">
              {picked.map((x) => (
                <li key={x.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{x.name}</p>
                    {x.barcode ? (
                      <p dir="ltr" className="num-ltr font-mono text-xs text-muted-foreground">
                        {x.barcode}
                      </p>
                    ) : null}
                  </div>
                  <Input
                    type="number"
                    min={1}
                    step="any"
                    dir="ltr"
                    inputMode="decimal"
                    className="num-ltr w-24 text-end"
                    value={x.qty}
                    aria-label={`${t('common.qty')} — ${x.name}`}
                    onChange={(e) =>
                      setPicked((prev) => prev.map((y) => (y.id === x.id ? { ...y, qty: e.target.value } : y)))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={t('common.delete')}
                    onClick={() => setPicked((prev) => prev.filter((y) => y.id !== x.id))}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('stock.transferNotePh')}
            rows={2}
          />

          <div className="flex justify-end">
            <Button onClick={() => void submit()} disabled={!canSubmit}>
              <ArrowLeftRight className="size-4" aria-hidden />
              {busy ? t('common.saving') : t('stock.submitTransfer')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* recent transfers */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <History className="size-4 text-primary" aria-hidden />
              {t('stock.recentTransfers')}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void recent.refetch()}>
              <RotateCw className="size-3.5" aria-hidden />
              {t('stock.refreshList')}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recent.loading && !recent.data ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (recent.data?.rows.length ?? 0) === 0 ? (
            <EmptyState icon={ArrowLeftRight} title={t('common.noData')} />
          ) : (
            <RecentTransfers rows={recent.data!.rows} />
          )}
          {recent.data ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('stock.movementsLoaded', { n: num(recent.data.rows.length, 0) })}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function RecentTransfers({ rows }: { rows: TransferRow[] }) {
  const { t, date, num } = useI18n()
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set<string>())
  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="max-h-[420px] overflow-auto scrollbar-thin rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/60">
            <TableHead className="text-start">{t('stock.thNumber')}</TableHead>
            <TableHead className="text-start">{t('stock.thFrom')}</TableHead>
            <TableHead className="text-start">{t('stock.thTo')}</TableHead>
            <TableHead className="text-center">{t('stock.thItemsCount')}</TableHead>
            <TableHead className="text-start">{t('common.date')}</TableHead>
            <TableHead className="w-12 text-center">{t('common.details')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((tr) => {
            const open = expanded.has(tr.id)
            return (
              <React.Fragment key={tr.id}>
                <TableRow className="hover:bg-muted/40">
                  <TableCell className="num-ltr font-semibold tabular-nums">#{tr.number}</TableCell>
                  <TableCell className="max-w-[140px] truncate text-sm">{tr.fromName}</TableCell>
                  <TableCell className="max-w-[140px] truncate text-sm">{tr.toName}</TableCell>
                  <TableCell className="num-ltr text-center tabular-nums">{num(tr.itemCount, 0)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {date(tr.date, true)}
                    {tr.createdBy ? (
                      <span className="block text-xs text-muted-foreground">
                        {t('common.createdBy')}: {tr.createdBy}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={open ? t('stock.hideDetails') : t('stock.showDetails')}
                      className="inline-flex size-7 items-center justify-center rounded-md hover:bg-accent"
                      onClick={() => toggle(tr.id)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={cn('size-4 transition-transform', open && 'rotate-180')}
                        aria-hidden
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  </TableCell>
                </TableRow>
                {open ? (
                  <TableRow className="hover:bg-inherit">
                    <TableCell colSpan={6} className="bg-muted/30">
                      <div className="ps-4 space-y-1 text-sm">
                        {tr.note ? <p className="mb-2 text-xs italic text-muted-foreground">“{tr.note}”</p> : null}
                        <ul className="space-y-0.5">
                          {tr.items.map((it) => (
                            <li key={`${tr.id}-${it.productId}`} className="flex items-baseline gap-2">
                              <span className="truncate">{it.productName}</span>
                              <span className="num-ltr text-muted-foreground">×{num(it.qty)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </React.Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ============================================================ movements tab

const MV_KINDS = [
  'SALE',
  'PURCHASE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUST_IN',
  'ADJUST_OUT',
  'OPENING',
  'SALE_CANCEL',
  'PURCHASE_CANCEL',
] as const

function MovementsTab({
  warehouses,
}: {
  warehouses: WarehouseDTO[]
}) {
  const { t, date } = useI18n()
  const [kind, setKind] = React.useState('ALL')
  const [wh, setWh] = React.useState('ALL')
  const [local, setLocal] = React.useState('')
  const debouncedLocal = useDebounced(local, 250)

  const url = React.useMemo(() => {
    const sp = new URLSearchParams({ limit: '150' })
    if (kind !== 'ALL') sp.set('kind', kind)
    if (wh !== 'ALL') sp.set('warehouseId', wh)
    return `/api/stock/movements?${sp.toString()}`
  }, [kind, wh])

  const mv = useApi<MovementDTO[]>(url)

  const filtered = React.useMemo(() => {
    const rows = mv.data ?? []
    const q = debouncedLocal.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((m) => m.productName.toLowerCase().includes(q))
  }, [mv.data, debouncedLocal])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-full sm:w-[200px]" aria-label={t('stock.tabMovements')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('stock.kind.ALL')}</SelectItem>
            {MV_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {t(`stock.kind.${k}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={wh} onValueChange={setWh}>
          <SelectTrigger className="w-full sm:w-[190px]" aria-label={t('common.warehouse')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('common.allWarehouses')}</SelectItem>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder={t('stock.mvSearchPh')}
          className="w-full sm:max-w-xs"
        />

        <div className="ms-auto flex items-center gap-2">
          {mv.fromCache ? <InlineSpinner label={t('shell.offline')} /> : null}
          <Button variant="outline" size="sm" onClick={() => void mv.refetch()}>
            <RotateCw className={cn('size-3.5', mv.loading && 'animate-spin')} aria-hidden />
            {t('stock.refreshList')}
          </Button>
        </div>
      </div>

      {mv.loading && !mv.data ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={History} title={t('stock.mvEmpty')} />
      ) : (
        <div className="max-h-[560px] overflow-auto scrollbar-thin rounded-lg border bg-card">
          <Table>
            <TableHeader className="sticky top-0 z-[1]">
              <TableRow className="bg-muted/70 backdrop-blur hover:bg-muted/70">
                <TableHead className="text-start whitespace-nowrap">{t('common.date')}</TableHead>
                <TableHead className="text-start min-w-[160px]">{t('stock.colProduct')}</TableHead>
                <TableHead className="text-start">{t('common.warehouse')}</TableHead>
                <TableHead className="text-center">{t('common.qty')}</TableHead>
                <TableHead className="text-start">{t('stock.thKind')}</TableHead>
                <TableHead className="text-start">{t('common.notes')}</TableHead>
                <TableHead className="text-start">{t('stock.refType')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id} className="hover:bg-muted/40">
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {date(m.createdAt, true)}
                  </TableCell>
                  <TableCell className="align-middle">
                    <p className="max-w-[220px] truncate text-sm font-medium">{m.productName}</p>
                    {(m as MovementDTO & { barcode?: string | null }).barcode ? (
                      <p
                        dir="ltr"
                        className="num-ltr font-mono text-xs text-muted-foreground"
                      >
                        {(m as MovementDTO & { barcode?: string | null }).barcode}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[120px] truncate text-sm">{m.warehouseName}</TableCell>
                  <TableCell className="text-center">
                    <SignedQty qty={m.qty} />
                  </TableCell>
                  <TableCell>
                    <KindChip kind={m.kind} />
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    {m.note ? (
                      <span title={m.note} className="block truncate text-sm text-muted-foreground">
                        {m.note}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.refType ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ============================================================ adjust tab

function AdjustTab({
  boot,
  refetchBoot,
  staff,
}: {
  boot: BootstrapShape | undefined
  refetchBoot: () => void
  staff: boolean
}) {
  const { t, num } = useI18n()
  const warehouses = boot?.warehouses ?? []

  const [whId, setWhId] = React.useState('')
  const [product, setProduct] = React.useState<ProductDTO | null>(null)
  const [newQty, setNewQty] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [doneHint, setDoneHint] = React.useState(false)

  if (!staff) {
    return (
      <Card className="mx-auto max-w-lg shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Lock className="size-7" aria-hidden />
          </span>
          <h2 className="font-bold">{t('stock.lockedTitle')}</h2>
          <p className="max-w-sm text-sm text-muted-foreground">{t('stock.lockedHint')}</p>
        </CardContent>
      </Card>
    )
  }

  const oldQty = product && whId ? round2(qtyOf(product, whId)) : null
  const parsedNew = Number(newQty)
  const hasNew = newQty !== '' && Number.isFinite(parsedNew) && parsedNew >= 0
  const delta = oldQty !== null && hasNew ? round2(parsedNew - oldQty) : null
  const canSubmit = !!product && !!whId && hasNew && !busy

  function pickProduct(p: ProductDTO) {
    setProduct(p)
    setDoneHint(false)
    if (whId) setNewQty(String(round2(qtyOf(p, whId))))
  }

  async function submit() {
    if (!product || !whId || !hasNew) return
    setBusy(true)
    try {
      await requestJson('/api/stock/adjust', {
        method: 'POST',
        body: JSON.stringify({
          warehouseId: whId,
          productId: product.id,
          newQty: parsedNew,
          reason: reason.trim() || undefined,
        }),
      })
      toast.success(t('stock.adjustDone'))
      setDoneHint(true)
      setProduct(null)
      setNewQty('')
      setReason('')
      refetchBoot()
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.queued) toast.info(t('common.savedOffline'))
        else toast.error(t('common.error'))
      } else toast.error(t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="size-4 text-primary" aria-hidden />
            {t('stock.tabAdjust')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!boot ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>{t('common.warehouse')}</Label>
                <Select
                  value={whId || undefined}
                  onValueChange={(v) => {
                    setWhId(v)
                    if (product) setNewQty(String(round2(qtyOf(product, v))))
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('common.select')} />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t('stock.pickProduct')}</Label>
                <ProductPicker
                  products={boot.products.filter((p) => p.trackStock)}
                  placeholder={t('stock.pickProduct')}
                  emptyLabel={t('stock.noSuggestions')}
                  onPick={pickProduct}
                />
              </div>

              {product ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('stock.oldQtyLbl')}:{' '}
                      <span className="num-ltr font-semibold tabular-nums">
                        {whId ? num(oldQty ?? 0) : '—'}
                      </span>{' '}
                      · {t('stock.availableHere')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground"
                    aria-label={t('common.close')}
                    onClick={() => {
                      setProduct(null)
                      setNewQty('')
                    }}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="adj-qty">{t('stock.newQtyLbl')}</Label>
                  <Input
                    id="adj-qty"
                    type="number"
                    min={0}
                    step="any"
                    dir="ltr"
                    inputMode="decimal"
                    placeholder={t('stock.newQtyPh')}
                    className="num-ltr text-end"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adj-reason">{t('stock.reasonLbl')}</Label>
                  <Input
                    id="adj-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t('stock.adjustReasonPh')}
                  />
                </div>
              </div>

              {/* live preview */}
              {delta !== null ? (
                <div className="rounded-lg border border-dashed bg-background px-3 py-2.5 text-sm">
                  <span className="text-muted-foreground">{t('stock.previewLbl')}: </span>
                  <span className="num-ltr font-semibold tabular-nums">{oldQty}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className="num-ltr font-semibold tabular-nums">{parsedNew}</span>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{t('stock.deltaLbl')}: </span>
                  <SignedQty qty={delta} />
                </div>
              ) : null}

              {doneHint ? (
                <p className="flex items-start gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {t('stock.adjustHint')}
                </p>
              ) : null}

              <div className="flex justify-end">
                <Button onClick={() => void submit()} disabled={!canSubmit}>
                  <ClipboardCheck className="size-4" aria-hidden />
                  {busy ? t('common.saving') : t('common.save')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================ main view

export default function WarehousesView() {
  const { t } = useI18n()
  const user = useSession((s) => s.user)
  const staff = user?.role === 'ADMIN' || user?.role === 'MANAGER'
  const boot = useApi<BootstrapShape>('/api/bootstrap')
  const [activeTab, setActiveTab] = React.useState<TabKey>('levels')

  const TAB_ITEMS: Array<{ key: TabKey; label: string; icon: typeof Warehouse }> = [
    { key: 'levels', label: t('stock.tabLevels'), icon: Boxes },
    { key: 'warehouses', label: t('stock.tabWarehouses'), icon: Warehouse },
    { key: 'transfers', label: t('stock.tabTransfers'), icon: ArrowLeftRight },
    { key: 'movements', label: t('stock.tabMovements'), icon: History },
    { key: 'adjust', label: t('stock.tabAdjust'), icon: ClipboardCheck },
  ]

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        icon={<Warehouse className="size-5" aria-hidden />}
        title={t('stock.title')}
        subtitle={t('stock.subtitle')}
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        {/* mobile tab switcher */}
        <div className="md:hidden">
          <Select value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
            <SelectTrigger className="w-full" aria-label={t('stock.title')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAB_ITEMS.map((it) => (
                <SelectItem key={it.key} value={it.key}>
                  {it.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* desktop tab bar */}
        <TabsList className="hidden max-w-full md:flex md:flex-1">
          {TAB_ITEMS.map((it) => (
            <TabsTrigger key={it.key} value={it.key} className="min-w-0 gap-1.5 px-2 lg:px-3">
              <it.icon className="size-4" aria-hidden />
              <span className="truncate">{it.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="levels" className="mt-4">
          <LevelsTab data={boot.data} />
        </TabsContent>
        <TabsContent value="warehouses" className="mt-4">
          <WarehousesTab boot={boot.data} refetchBoot={boot.refetch} staff={staff} />
        </TabsContent>
        <TabsContent value="transfers" className="mt-4">
          <TransfersTab boot={boot.data} refetchBoot={boot.refetch} />
        </TabsContent>
        <TabsContent value="movements" className="mt-4">
          <MovementsTab warehouses={boot.data?.warehouses ?? []} />
        </TabsContent>
        <TabsContent value="adjust" className="mt-4">
          <AdjustTab boot={boot.data} refetchBoot={boot.refetch} staff={staff} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
