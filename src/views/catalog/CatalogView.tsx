'use client'

/**
 * Products / Catalog management screen (Task 2-a, CatalogAgent).
 * Server-paginated list via GET /api/products (+ filters), add/edit dialog with
 * opening balances, categories & units manager. Source of truth for filter
 * options / stats: GET /api/bootstrap.
 */

import * as React from 'react'
import {
  AlertTriangle,
  Barcode,
  Check,
  Coins,
  Layers,
  Loader2,
  Package,
  PackageX,
  Pencil,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'
import { useSession } from '@/stores/session'
import { ApiError, requestJson, useApi } from '@/hooks/use-api'
import type { CategoryDTO, LevelDTO, UnitDTO, WarehouseDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

// ============================================================ types & helpers

/** One row of GET /api/products (list projection of ProductDTO). */
interface ProductRow {
  id: string
  sku: string | null
  barcode: string | null
  name: string
  nameEn: string | null
  categoryId: string | null
  unitId: string | null
  cost: number
  price: number
  minQty: number
  trackStock: boolean
  imageUrl: string | null
  notes: string | null
  active: boolean
  categoryName: string | null
  unitName: string | null
  unitShort: string | null
  stock: number
}

interface ProductsPage {
  total: number
  page: number
  pageSize: number
  rows: ProductRow[]
}

/** Slim bootstrap shape — only what this screen consumes. */
interface BootShape {
  categories: CategoryDTO[]
  units: UnitDTO[]
  warehouses: WarehouseDTO[]
  products: Array<{
    id: string
    cost: number
    minQty: number
    trackStock: boolean
    levels: LevelDTO[]
  }>
}

/** Radix Select can't hold value="" → sentinel for “no selection”. */
const NONE = '__none__'
const fromNone = (v: string): string | null => (v === NONE ? null : v)
const toNone = (v: string | null): string => (v ? v : NONE)

type TFunc = ReturnType<typeof useI18n>['t']

function apiErrText(t: TFunc, e: unknown, codes?: Record<string, string>): string {
  const msg = e instanceof ApiError ? e.message : ''
  if (msg && codes && codes[msg]) return t(codes[msg])
  return msg || t('catalog.errDefault')
}

function isQueued(e: unknown): boolean {
  return e instanceof ApiError && e.queued
}

function generateBarcode(): string {
  let s = '62'
  for (let i = 0; i < 11; i++) s += String(Math.floor(Math.random() * 10))
  return s
}

/** Debounce fast-changing values (search box). */
function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = React.useState<T>(value)
  React.useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return v
}

function isLowStock(stock: number, minQty: number): boolean {
  return minQty > 0 && stock <= minQty
}

const BTN_TOUCH = 'h-11 sm:h-9'
const ICON_BTN_TOUCH = 'size-11 sm:size-8'

// ============================================================ page

export default function CatalogView() {
  const { t, money, num } = useI18n()
  const role = useSession((s) => s.user?.role)
  const staff = role === 'ADMIN' || role === 'MANAGER'

  // ---- global reference data (filter options + stats)
  const boot = useApi<BootShape>('/api/bootstrap')

  // ---- optimistic extras so inline-created cats/units appear instantly in Selects
  const [extraCats, setExtraCats] = React.useState<CategoryDTO[]>([])
  const [extraUnits, setExtraUnits] = React.useState<UnitDTO[]>([])

  const categories: CategoryDTO[] = React.useMemo(() => {
    const base = boot.data?.categories ?? []
    if (!extraCats.length) return base
    const ids = new Set(base.map((c) => c.id))
    return [...base, ...extraCats.filter((c) => !ids.has(c.id))]
  }, [boot.data?.categories, extraCats])

  const units: UnitDTO[] = React.useMemo(() => {
    const base = boot.data?.units ?? []
    if (!extraUnits.length) return base
    const ids = new Set(base.map((u) => u.id))
    return [...base, ...extraUnits.filter((u) => !ids.has(u.id))]
  }, [boot.data?.units, extraUnits])

  // ---- filters & pagination
  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebounced(search, 350)
  const [catFilter, setCatFilter] = React.useState('all')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)

  const listUrl = React.useMemo(() => {
    const sp = new URLSearchParams()
    if (debouncedSearch.trim()) sp.set('q', debouncedSearch.trim())
    if (catFilter !== 'all') sp.set('categoryId', catFilter)
    if (statusFilter !== 'all') sp.set('active', statusFilter)
    sp.set('page', String(page))
    sp.set('pageSize', String(pageSize))
    return `/api/products?${sp.toString()}`
  }, [debouncedSearch, catFilter, statusFilter, page, pageSize])

  const list = useApi<ProductsPage>(listUrl)

  // ---- stats over the whole catalog (bootstrap source of truth)
  const stats = React.useMemo(() => {
    const ps = boot.data?.products ?? []
    let value = 0
    let low = 0
    for (const p of ps) {
      const stock = p.levels.reduce((s, l) => s + l.qty, 0)
      value += stock * p.cost
      if (isLowStock(stock, p.minQty)) low++
    }
    return { count: ps.length, value, low }
  }, [boot.data])

  // ---- dialog state
  const [formOpen, setFormOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<ProductRow | null>(null)
  const [managerOpen, setManagerOpen] = React.useState(false)
  const [pendingDelete, setPendingDelete] = React.useState<ProductRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  function openCreate() {
    setEditTarget(null)
    setFormOpen(true)
  }

  function openEdit(p: ProductRow) {
    setEditTarget(p)
    setFormOpen(true)
  }

  async function createCategory(name: string): Promise<CategoryDTO | null> {
    try {
      const created = await requestJson<CategoryDTO>('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setExtraCats((prev) => [...prev, created])
      boot.refetch()
      toast.success(t('common.created'))
      return created
    } catch (e) {
      if (isQueued(e)) toast.info(t('common.savedOffline'))
      else toast.error(apiErrText(t, e))
      return null
    }
  }

  async function createUnit(name: string, shortName: string): Promise<UnitDTO | null> {
    try {
      const body: Record<string, string> = { name }
      if (shortName.trim()) body.shortName = shortName.trim()
      const created = await requestJson<UnitDTO>('/api/units', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setExtraUnits((prev) => [...prev, created])
      boot.refetch()
      toast.success(t('common.created'))
      return created
    } catch (e) {
      if (isQueued(e)) toast.info(t('common.savedOffline'))
      else toast.error(apiErrText(t, e))
      return null
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return
    setDeleting(true)
    try {
      const res = await requestJson<{ id: string; deactivated?: boolean }>(
        `/api/products/${pendingDelete.id}`,
        { method: 'DELETE' }
      )
      if (res.deactivated) toast.warning(t('catalog.deletedSoft'))
      else toast.success(t('common.deleted'))
      setPendingDelete(null)
      list.refetch()
      boot.refetch()
    } catch (e) {
      if (isQueued(e)) toast.info(t('common.savedOffline'))
      else toast.error(apiErrText(t, e))
    } finally {
      setDeleting(false)
    }
  }

  const totalRows = list.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))

  const rowsLoading = list.loading && !list.data
  const showSkeleton = rowsLoading || (!list.data && !list.error)
  const emptyVisible =
    !showSkeleton && !list.error && !!list.data && list.data.rows.length === 0

  function resetToFirstPage() {
    setPage(1)
  }

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        icon={<Package className="size-5" aria-hidden />}
        title={t('nav.catalog')}
        subtitle={t('catalog.headerSub')}
      />

      {/* ---------- stat cards ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {boot.loading && !boot.data ? (
          <>
            <Skeleton className="h-[86px] rounded-xl" />
            <Skeleton className="h-[86px] rounded-xl" />
            <Skeleton className="h-[86px] rounded-xl" />
          </>
        ) : (
          <>
            <StatCard
              label={t('catalog.statProducts')}
              value={num(stats.count, 0)}
              tone="default"
              icon={Package}
            />
            <StatCard
              label={t('catalog.statStockValue')}
              value={money(stats.value)}
              tone="success"
              icon={Coins}
            />
            <StatCard
              label={t('catalog.statLowAlert')}
              value={num(stats.low, 0)}
              tone="warn"
              icon={AlertTriangle}
            />
          </>
        )}
      </div>

      {/* ---------- toolbar ---------- */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 min-w-0">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              resetToFirstPage()
            }}
            placeholder={t('catalog.searchPlaceholder')}
            aria-label={t('catalog.searchPlaceholder')}
            className="ps-9 h-11 sm:h-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* category filter */}
          <Select
            value={catFilter}
            onValueChange={(v) => {
              setCatFilter(v)
              resetToFirstPage()
            }}
          >
            <SelectTrigger
              className={`w-full sm:w-44 ${BTN_TOUCH}`}
              aria-label={t('common.category')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('catalog.allCategories')}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* status filter */}
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v)
              resetToFirstPage()
            }}
          >
            <SelectTrigger
              className={`w-full sm:w-32 ${BTN_TOUCH}`}
              aria-label={t('common.status')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('catalog.statusAll')}</SelectItem>
              <SelectItem value="1">{t('catalog.active')}</SelectItem>
              <SelectItem value="0">{t('catalog.inactive')}</SelectItem>
            </SelectContent>
          </Select>

          {staff ? (
            <>
              <Button
                variant="outline"
                onClick={() => setManagerOpen(true)}
                className={`${BTN_TOUCH} flex-1 lg:flex-none`}
              >
                <Layers className="size-4" aria-hidden />
                {t('catalog.managerBtn')}
              </Button>
              <Button onClick={openCreate} className={`${BTN_TOUCH} flex-1 lg:flex-none`}>
                <Plus className="size-4" aria-hidden />
                {t('catalog.addProduct')}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* ---------- content card ---------- */}
      <Card className="overflow-hidden py-0 shadow-sm">
        <CardContent className="p-0">
          {showSkeleton ? (
            <div className="space-y-3 p-4">
              {/* desktop-shaped skeleton */}
              <div className="hidden sm:block space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
              {/* mobile-shaped skeleton */}
              <div className="sm:hidden space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ) : list.error && !list.data ? (
            <div className="p-4">
              <EmptyState
                icon={TriangleAlert}
                title={t('catalog.loadFailed')}
                hint={list.error}
                action={
                  <Button variant="outline" onClick={list.refetch} className={BTN_TOUCH}>
                    {t('common.retry')}
                  </Button>
                }
              />
            </div>
          ) : emptyVisible ? (
            <div className="p-4">
              <EmptyState
                icon={PackageX}
                title={t('catalog.emptyTitle')}
                hint={t('catalog.emptyHint')}
                action={
                  staff ? (
                    <Button onClick={openCreate} className={BTN_TOUCH}>
                      <Plus className="size-4" aria-hidden />
                      {t('catalog.addProduct')}
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              {/* ---------- desktop table ---------- */}
              <div
                className={cn(
                  'hidden sm:block overflow-x-auto transition-opacity',
                  list.loading && 'opacity-60 pointer-events-none'
                )}
              >
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-start">{t('catalog.col.product')}</TableHead>
                      <TableHead className="text-start">{t('common.barcode')}</TableHead>
                      <TableHead className="text-start">{t('common.category')}</TableHead>
                      <TableHead className="text-end">{t('common.price')}</TableHead>
                      <TableHead className="text-end">{t('common.cost')}</TableHead>
                      <TableHead className="text-end">{t('catalog.col.available')}</TableHead>
                      <TableHead className="text-center">{t('common.status')}</TableHead>
                      <TableHead className="text-end">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(list.data?.rows ?? []).map((p) => {
                      const low = p.trackStock && isLowStock(p.stock, p.minQty)
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="max-w-[16rem]">
                            <span className="block font-semibold text-sm leading-snug truncate">
                              {p.name}
                            </span>
                            {p.nameEn ? (
                              <span className="block text-xs text-muted-foreground num-ltr truncate">
                                {p.nameEn}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-mono text-xs num-ltr whitespace-nowrap">
                            {p.barcode || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            {p.categoryName ? (
                              <Badge variant="secondary" className="max-w-[8rem] truncate">
                                {p.categoryName}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {t('catalog.noCategory')}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-end font-semibold num-ltr whitespace-nowrap">
                            {money(p.price)}
                          </TableCell>
                          <TableCell className="text-end text-muted-foreground num-ltr whitespace-nowrap">
                            {money(p.cost)}
                          </TableCell>
                          <TableCell className="text-end whitespace-nowrap">
                            {!p.trackStock ? (
                              <Badge
                                variant="outline"
                                className="font-normal text-muted-foreground"
                              >
                                {t('catalog.serviceItem')}
                              </Badge>
                            ) : (
                              <span
                                className={cn(
                                  'inline-flex items-center justify-end gap-1 font-semibold num-ltr',
                                  low && 'text-red-600 dark:text-red-400'
                                )}
                              >
                                {low ? <TriangleAlert className="size-3.5" aria-hidden /> : null}
                                {num(p.stock)}
                                {p.unitShort ? (
                                  <span className="text-xs font-normal text-muted-foreground">
                                    {p.unitShort}
                                  </span>
                                ) : null}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {p.active ? (
                              <Badge variant="outline">{t('catalog.active')}</Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-destructive/30 text-destructive"
                              >
                                {t('catalog.inactive')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-end">
                            <div className="inline-flex items-center gap-1">
                              {staff ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={ICON_BTN_TOUCH}
                                    aria-label={`${t('common.edit')}: ${p.name}`}
                                    onClick={() => openEdit(p)}
                                  >
                                    <Pencil className="size-4" aria-hidden />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(ICON_BTN_TOUCH, 'text-destructive hover:text-destructive')}
                                    aria-label={`${t('common.delete')}: ${p.name}`}
                                    onClick={() => setPendingDelete(p)}
                                  >
                                    <Trash2 className="size-4" aria-hidden />
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={ICON_BTN_TOUCH}
                                  aria-label={`${t('common.edit')}: ${p.name}`}
                                  onClick={() => openEdit(p)}
                                >
                                  <Pencil className="size-4" aria-hidden />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* ---------- mobile cards ---------- */}
              <div
                className={cn(
                  'sm:hidden divide-y transition-opacity',
                  list.loading && 'opacity-60 pointer-events-none'
                )}
              >
                {(list.data?.rows ?? []).map((p) => {
                  const low = p.trackStock && isLowStock(p.stock, p.minQty)
                  return (
                    <div key={p.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold leading-snug break-words">{p.name}</p>
                          {p.nameEn ? (
                            <p className="text-xs text-muted-foreground num-ltr truncate">
                              {p.nameEn}
                            </p>
                          ) : null}
                        </div>
                        {p.active ? (
                          <Badge variant="outline" className="shrink-0">
                            {t('catalog.active')}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-destructive/30 text-destructive"
                          >
                            {t('catalog.inactive')}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                        {p.barcode ? (
                          <span className="font-mono num-ltr">{p.barcode}</span>
                        ) : null}
                        {p.categoryName ? (
                          <Badge variant="secondary" className="max-w-[7rem] truncate">
                            {p.categoryName}
                          </Badge>
                        ) : null}
                        {!p.trackStock ? (
                          <span>{t('catalog.serviceItem')}</span>
                        ) : null}
                      </div>

                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold num-ltr">{money(p.price)}</p>
                          <p className="text-xs text-muted-foreground num-ltr">
                            {money(p.cost)}
                          </p>
                        </div>
                        <div className="text-end">
                          {!p.trackStock ? (
                            <Badge variant="outline" className="font-normal text-muted-foreground">
                              {t('catalog.serviceItem')}
                            </Badge>
                          ) : (
                            <p
                              className={cn(
                                'font-semibold num-ltr',
                                low && 'text-red-600 dark:text-red-400'
                              )}
                            >
                              {low ? <TriangleAlert className="inline size-3.5 me-1" aria-hidden /> : null}
                              {num(p.stock)} {p.unitShort}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {t('catalog.col.available')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1 pt-1">
                        {staff ? (
                          <>
                            <Button
                              variant="outline"
                              size="icon"
                              className={ICON_BTN_TOUCH}
                              aria-label={`${t('common.edit')}: ${p.name}`}
                              onClick={() => openEdit(p)}
                            >
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className={cn(ICON_BTN_TOUCH, 'text-destructive hover:text-destructive')}
                              aria-label={`${t('common.delete')}: ${p.name}`}
                              onClick={() => setPendingDelete(p)}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="icon"
                            className={ICON_BTN_TOUCH}
                            aria-label={`${t('common.edit')}: ${p.name}`}
                            onClick={() => openEdit(p)}
                          >
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ---------- pagination footer ---------- */}
              <div className="border-t px-4 py-3 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 order-2 sm:order-1">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {t('common.rowsPerPage')}
                  </span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => {
                      setPageSize(Number(v))
                      resetToFirstPage()
                    }}
                  >
                    <SelectTrigger className="w-[5rem] h-9" aria-label={t('common.rowsPerPage')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 20, 50].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {num(n, 0)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <span className="order-1 sm:order-2 text-sm text-muted-foreground num-ltr whitespace-nowrap">
                  {t('common.pageOf', { p: Math.min(page, totalPages), n: totalPages })}
                </span>

                <div className="order-3 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={page <= 1}
                    className="size-9"
                    aria-label={t('catalog.prev')}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronFlip dir="start" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={page >= totalPages}
                    className="size-9"
                    aria-label={t('catalog.next')}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronFlip dir="end" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------- add / edit dialog (mounted only while open) ---------- */}
      {formOpen ? (
        <ProductFormDialog
          product={editTarget}
          categories={categories}
          units={units}
          warehouses={boot.data?.warehouses ?? []}
          createCategory={createCategory}
          createUnit={createUnit}
          close={() => setFormOpen(false)}
          saved={() => {
            list.refetch()
            boot.refetch()
          }}
        />
      ) : null}

      {/* ---------- categories & units manager ---------- */}
      <ManagerDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
        refreshRefs={() => {
          boot.refetch()
          list.refetch()
        }}
      />

      {/* ---------- delete confirm ---------- */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('catalog.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? t('catalog.deleteConfirmDesc', { name: pendingDelete.name })
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_TOUCH}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className={`${BTN_TOUCH} bg-destructive text-white hover:bg-destructive/90`}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t('common.saving')}
                </>
              ) : (
                t('common.delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Chevron that flips automatically with document direction. */
function ChevronFlip({ dir }: { dir: 'start' | 'end' }) {
  const { dir: docDir } = useI18n()
  const rtl = docDir === 'rtl'
  const forward = dir === 'end'
  const flipped = forward !== rtl
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-4', flipped ? 'rotate-180' : '')}
      aria-hidden
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

// ============================================================ add / edit dialog

interface ProductFormDialogProps {
  product: ProductRow | null
  categories: CategoryDTO[]
  units: UnitDTO[]
  warehouses: WarehouseDTO[]
  createCategory: (name: string) => Promise<CategoryDTO | null>
  createUnit: (name: string, shortName: string) => Promise<UnitDTO | null>
  close: () => void
  saved: () => void
}

function ProductFormDialog({
  product,
  categories,
  units,
  warehouses,
  createCategory,
  createUnit,
  close,
  saved,
}: ProductFormDialogProps) {
  const { t } = useI18n()
  const isEdit = !!product

  const [name, setName] = React.useState(product?.name ?? '')
  const [nameEn, setNameEn] = React.useState(product?.nameEn ?? '')
  const [sku, setSku] = React.useState(product?.sku ?? '')
  const [barcode, setBarcode] = React.useState(product?.barcode ?? '')
  const [categoryId, setCategoryId] = React.useState(toNone(product?.categoryId ?? null))
  const [unitId, setUnitId] = React.useState(toNone(product?.unitId ?? null))
  const [cost, setCost] = React.useState(product ? String(product.cost) : '0')
  const [price, setPrice] = React.useState(product ? String(product.price) : '0')
  const [minQty, setMinQty] = React.useState(product ? String(product.minQty) : '0')
  const [trackStock, setTrackStock] = React.useState(product?.trackStock ?? true)
  const [imageUrl, setImageUrl] = React.useState(product?.imageUrl ?? '')
  const [notes, setNotes] = React.useState(product?.notes ?? '')
  const [openings, setOpenings] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  const [quickKind, setQuickKind] = React.useState<'category' | 'unit' | null>(null)
  const [quickName, setQuickName] = React.useState('')
  const [quickShort, setQuickShort] = React.useState('')
  const [quickSaving, setQuickSaving] = React.useState(false)

  async function submit() {
    if (saving) return
    if (!name.trim()) {
      toast.error(t('catalog.nameRequired'))
      return
    }
    const c = Number(cost)
    const pr = Number(price)
    if (!Number.isFinite(c) || c < 0 || !Number.isFinite(pr) || pr < 0) {
      toast.error(t('catalog.invalidAmount'))
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        nameEn: nameEn.trim(),
        sku: sku.trim(),
        barcode: barcode.trim(),
        categoryId: fromNone(categoryId),
        unitId: fromNone(unitId),
        cost: round2(c),
        price: round2(pr),
        minQty: Math.max(0, Math.floor(Number(minQty) || 0)),
        trackStock,
        imageUrl: imageUrl.trim(),
        notes,
      }
      if (!isEdit) {
        const openingQty = Object.entries(openings)
          .map(([warehouseId, v]) => ({ warehouseId, qty: Number(v) }))
          .filter((o) => o.warehouseId && o.qty > 0)
        if (openingQty.length) body.openingQty = openingQty
        await requestJson('/api/products', { method: 'POST', body: JSON.stringify(body) })
        toast.success(t('common.created'))
      } else {
        await requestJson(`/api/products/${product!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success(t('common.updated'))
      }
      saved()
      close()
    } catch (e) {
      if (isQueued(e)) toast.info(t('common.savedOffline'))
      else if (e instanceof ApiError && e.message === 'trial-limit-products')
        toast.error(t('toast.trialLimitProducts'), { duration: 8000 })
      else toast.error(apiErrText(t, e))
    } finally {
      setSaving(false)
    }
  }

  async function quickSave() {
    if (quickSaving || !quickKind || !quickName.trim()) return
    setQuickSaving(true)
    try {
      if (quickKind === 'category') {
        const created = await createCategory(quickName.trim())
        if (created) setCategoryId(created.id)
      } else {
        const created = await createUnit(quickName.trim(), quickShort)
        if (created) setUnitId(created.id)
      }
      setQuickKind(null)
      setQuickName('')
      setQuickShort('')
    } finally {
      setQuickSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('catalog.editTitle') : t('catalog.newTitle')}</DialogTitle>
          <DialogDescription>{t('catalog.headerSub')}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">{t('catalog.fieldName')}</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 sm:h-9"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-name-en">{t('catalog.fieldNameEn')}</Label>
            <Input
              id="cat-name-en"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className="h-11 sm:h-9 num-ltr"
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-sku">{t('common.code')}</Label>
            <Input
              id="cat-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="h-11 sm:h-9 num-ltr"
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-barcode">{t('common.barcode')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="cat-barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                inputMode="numeric"
                className="h-11 sm:h-9 flex-1 min-w-0 font-mono num-ltr"
                dir="ltr"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 sm:size-9 shrink-0"
                aria-label={t('catalog.genBarcode')}
                onClick={() => setBarcode(generateBarcode())}
              >
                <Barcode className="size-4" aria-hidden />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-cat">{t('common.category')}</Label>
            <div className="flex items-center gap-2">
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="cat-cat" className={`${BTN_TOUCH} flex-1 min-w-0`}>
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 sm:size-9 shrink-0"
                aria-label={t('catalog.addCategory')}
                onClick={() => setQuickKind('category')}
              >
                <Plus className="size-4" aria-hidden />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-unit">{t('common.unit')}</Label>
            <div className="flex items-center gap-2">
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger id="cat-unit" className={`${BTN_TOUCH} flex-1 min-w-0`}>
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 sm:size-9 shrink-0"
                aria-label={t('catalog.addUnit')}
                onClick={() => setQuickKind('unit')}
              >
                <Plus className="size-4" aria-hidden />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-cost">{t('catalog.fieldCost')}</Label>
            <Input
              id="cat-cost"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="h-11 sm:h-9 num-ltr"
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-price">{t('catalog.fieldPrice')}</Label>
            <Input
              id="cat-price"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-11 sm:h-9 num-ltr"
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-minqty">{t('catalog.fieldMinQty')}</Label>
            <Input
              id="cat-minqty"
              type="number"
              inputMode="numeric"
              min={0}
              step="1"
              value={minQty}
              onChange={(e) => setMinQty(e.target.value)}
              className="h-11 sm:h-9 num-ltr"
              dir="ltr"
            />
          </div>

          <div className="rounded-lg border p-3 flex items-start justify-between gap-3 sm:self-end">
            <div className="space-y-1 min-w-0">
              <Label htmlFor="cat-track">{t('catalog.trackStock')}</Label>
              <p className="text-xs text-muted-foreground">{t('catalog.trackStockHint')}</p>
            </div>
            <Switch
              id="cat-track"
              checked={trackStock}
              onCheckedChange={setTrackStock}
              className="mt-0.5 shrink-0"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cat-image">{t('catalog.fieldImage')}</Label>
            <Input
              id="cat-image"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              inputMode="url"
              className="h-11 sm:h-9 num-ltr"
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cat-notes">{t('common.notes')}</Label>
            <Textarea
              id="cat-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* ---- opening balances (create mode only) ---- */}
          {!isEdit ? (
            <div className="sm:col-span-2 space-y-3 rounded-xl border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-semibold">{t('catalog.openingTitle')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('catalog.openingHint')}
                </p>
              </div>
              {warehouses.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {warehouses.map((w) => (
                    <div key={w.id} className="space-y-1.5">
                      <Label htmlFor={`cat-open-${w.id}`} className="truncate block">
                        {w.name}
                      </Label>
                      <Input
                        id={`cat-open-${w.id}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={openings[w.id] ?? ''}
                        onChange={(e) =>
                          setOpenings((prev) => ({ ...prev, [w.id]: e.target.value }))
                        }
                        placeholder="0"
                        className="h-11 sm:h-9 num-ltr"
                        dir="ltr"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close} className={BTN_TOUCH}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={saving} className={BTN_TOUCH}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t('common.saving')}
              </>
            ) : (
              t('common.save')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* ---- inline “new category/unit” mini-dialog ---- */}
      <Dialog
        open={quickKind !== null}
        onOpenChange={(o) => {
          if (!o) setQuickKind(null)
        }}
      >
        <DialogContent className="sm:max-w-sm z-[60]">
          <DialogHeader>
            <DialogTitle>
              {quickKind === 'category' ? t('catalog.addCategory') : t('catalog.addUnit')}
            </DialogTitle>
            <DialogDescription>{t('catalog.mgrSubtitle')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="quick-name">{t('common.name')}</Label>
              <Input
                id="quick-name"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                autoFocus
                className="h-11 sm:h-9"
              />
            </div>
            {quickKind === 'unit' ? (
              <div className="space-y-1.5">
                <Label htmlFor="quick-short">{t('catalog.shortPlaceholder')}</Label>
                <Input
                  id="quick-short"
                  value={quickShort}
                  onChange={(e) => setQuickShort(e.target.value)}
                  placeholder={t('catalog.shortPlaceholder')}
                  className="h-11 sm:h-9"
                />
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setQuickKind(null)}
              className={BTN_TOUCH}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => void quickSave()}
              disabled={quickSaving || !quickName.trim()}
              className={BTN_TOUCH}
            >
              {quickSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t('common.saving')}
                </>
              ) : (
                t('common.save')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ============================================================ manager dialog

interface ManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  refreshRefs: () => void
}

type ManagerKind = 'category' | 'unit'

function ManagerDialog({ open, onOpenChange, refreshRefs }: ManagerDialogProps) {
  const { t } = useI18n()

  const cats = useApi<CategoryDTO[]>(open ? '/api/categories' : null)
  const units = useApi<UnitDTO[]>(open ? '/api/units' : null)

  const [tab, setTab] = React.useState<ManagerKind>('category')

  // rename state
  const [editing, setEditing] = React.useState<{ kind: ManagerKind; id: string } | null>(null)
  const [editName, setEditName] = React.useState('')
  const [editShort, setEditShort] = React.useState('')
  const [renameSaving, setRenameSaving] = React.useState(false)

  // add row state
  const [addName, setAddName] = React.useState('')
  const [addShort, setAddShort] = React.useState('')
  const [adding, setAdding] = React.useState(false)

  // delete state
  const [delTarget, setDelTarget] = React.useState<{ kind: ManagerKind; id: string } | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  function refreshAll() {
    cats.refetch()
    units.refetch()
    refreshRefs()
  }

  function startRename(kind: ManagerKind, row: CategoryDTO | UnitDTO) {
    setEditing({ kind, id: row.id })
    setEditName(row.name)
    setEditShort(kind === 'unit' ? ((row as UnitDTO).shortName ?? '') : '')
  }

  function cancelRename() {
    setEditing(null)
    setEditName('')
    setEditShort('')
  }

  async function saveRename() {
    if (!editing || renameSaving || !editName.trim()) return
    setRenameSaving(true)
    try {
      const url =
        editing.kind === 'category' ? `/api/categories/${editing.id}` : `/api/units/${editing.id}`
      const body =
        editing.kind === 'unit'
          ? { name: editName.trim(), shortName: editShort.trim() }
          : { name: editName.trim() }
      await requestJson(url, { method: 'PUT', body: JSON.stringify(body) })
      toast.success(t('common.updated'))
      cancelRename()
      refreshAll()
    } catch (e) {
      if (isQueued(e)) toast.info(t('common.savedOffline'))
      else toast.error(apiErrText(t, e))
    } finally {
      setRenameSaving(false)
    }
  }

  async function addNew() {
    if (adding || !addName.trim()) return
    setAdding(true)
    try {
      const body: Record<string, string> = { name: addName.trim() }
      if (tab === 'unit' && addShort.trim()) body.shortName = addShort.trim()
      const url = tab === 'category' ? '/api/categories' : '/api/units'
      await requestJson(url, { method: 'POST', body: JSON.stringify(body) })
      toast.success(t('common.created'))
      setAddName('')
      setAddShort('')
      refreshAll()
    } catch (e) {
      if (isQueued(e)) toast.info(t('common.savedOffline'))
      else toast.error(apiErrText(t, e))
    } finally {
      setAdding(false)
    }
  }

  async function confirmDelete() {
    if (!delTarget || deleting) return
    setDeleting(true)
    try {
      const url =
        delTarget.kind === 'category'
          ? `/api/categories/${delTarget.id}`
          : `/api/units/${delTarget.id}`
      await requestJson(url, { method: 'DELETE' })
      toast.success(t('common.deleted'))
      setDelTarget(null)
      refreshAll()
    } catch (e) {
      if (isQueued(e)) toast.info(t('common.savedOffline'))
      else {
        toast.error(
          delTarget.kind === 'category'
            ? apiErrText(t, e, { 'in-use': 'catalog.categoryInUse' })
            : apiErrText(t, e)
        )
      }
    } finally {
      setDeleting(false)
    }
  }

  const catRows = cats.data ?? []
  const unitRows = units.data ?? []
  const kindLabel = tab === 'category' ? t('catalog.tabCategories') : t('catalog.tabUnits')

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="size-4 text-primary" aria-hidden />
              {t('catalog.managerBtn')}
            </DialogTitle>
            <DialogDescription>{t('catalog.mgrSubtitle')}</DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as ManagerKind)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="category">{t('catalog.tabCategories')}</TabsTrigger>
              <TabsTrigger value="unit">{t('catalog.tabUnits')}</TabsTrigger>
            </TabsList>

            {/* ------------------- categories ------------------- */}
            <TabsContent value="category" className="mt-3">
              <ManagerList
                loading={!cats.data && cats.loading}
                count={catRows.length}
                rows={catRows.map((c) => ({ id: c.id, name: c.name }))}
                showShort={false}
                editingId={editing?.kind === 'category' ? editing.id : null}
                editName={editName}
                editShort=""
                canSaveRename={!!editName.trim()}
                renameSaving={renameSaving}
                onEditName={setEditName}
                onEditShort={() => {}}
                onStartRename={(id) => {
                  const row = catRows.find((c) => c.id === id)
                  if (row) startRename('category', row)
                }}
                onSaveRename={() => void saveRename()}
                onCancelRename={cancelRename}
                onDelete={(id) => setDelTarget({ kind: 'category', id })}
              />
            </TabsContent>

            {/* ------------------- units ------------------- */}
            <TabsContent value="unit" className="mt-3">
              <ManagerList
                loading={!units.data && units.loading}
                count={unitRows.length}
                rows={unitRows.map((u) => ({
                  id: u.id,
                  name: u.name,
                  extra: u.shortName || undefined,
                }))}
                showShort
                editingId={editing?.kind === 'unit' ? editing.id : null}
                editName={editName}
                editShort={editShort}
                canSaveRename={!!editName.trim()}
                renameSaving={renameSaving}
                onEditName={setEditName}
                onEditShort={setEditShort}
                onStartRename={(id) => {
                  const row = unitRows.find((u) => u.id === id)
                  if (row) startRename('unit', row)
                }}
                onSaveRename={() => void saveRename()}
                onCancelRename={cancelRename}
                onDelete={(id) => setDelTarget({ kind: 'unit', id })}
              />
            </TabsContent>
          </Tabs>

          {/* add new row */}
          <Separator className="my-1" />
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{kindLabel}</p>
            <div className="flex items-center gap-2">
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void addNew()
                  }
                }}
                placeholder={t('catalog.newItemPlaceholder')}
                aria-label={`${t('common.add')} — ${kindLabel}`}
                className="h-11 sm:h-9 flex-1 min-w-0"
              />
              {tab === 'unit' ? (
                <Input
                  value={addShort}
                  onChange={(e) => setAddShort(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void addNew()
                    }
                  }}
                  placeholder={t('catalog.shortPlaceholder')}
                  aria-label={t('catalog.shortPlaceholder')}
                  className="h-11 sm:h-9 w-28 shrink-0"
                />
              ) : null}
              <Button
                onClick={() => void addNew()}
                disabled={adding || !addName.trim()}
                className="h-11 sm:h-9 shrink-0"
              >
                {adding ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Plus className="size-4" aria-hidden />
                )}
                <span className="hidden sm:inline">{t('common.add')}</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <AlertDialog
        open={!!delTarget}
        onOpenChange={(o) => {
          if (!o) setDelTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {delTarget?.kind === 'category'
                ? t('catalog.delCatTitle')
                : t('catalog.delUnitTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {delTarget?.kind === 'category'
                ? t('catalog.delCatDesc')
                : t('catalog.delUnitDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_TOUCH}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className={`${BTN_TOUCH} bg-destructive text-white hover:bg-destructive/90`}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t('common.saving')}
                </>
              ) : (
                t('common.delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ---------------------------------------------------------------- manager list

interface ManagerListProps {
  loading: boolean
  count: number
  rows: Array<{ id: string; name: string; extra?: string }>
  showShort: boolean
  editingId: string | null
  editName: string
  editShort: string
  canSaveRename: boolean
  renameSaving: boolean
  onEditName: (v: string) => void
  onEditShort: (v: string) => void
  onStartRename: (id: string) => void
  onSaveRename: () => void
  onCancelRename: () => void
  onDelete: (id: string) => void
}

function ManagerList(props: ManagerListProps) {
  const {
    loading,
    count,
    rows,
    showShort,
    editingId,
    editName,
    editShort,
    canSaveRename,
    renameSaving,
    onEditName,
    onEditShort,
    onStartRename,
    onSaveRename,
    onCancelRename,
    onDelete,
  } = props
  const { t } = useI18n()

  if (loading) {
    return (
      <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin pe-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (count === 0) {
    return <EmptyState icon={PackageX} title={t('common.noData')} />
  }

  return (
    <ul className="max-h-80 overflow-y-auto scrollbar-thin pe-1 space-y-1">
      {rows.map((row) => (
        <li
          key={row.id}
          className="rounded-lg border px-2.5 py-1.5 flex items-center gap-2"
        >
          {editingId === row.id ? (
            <>
              <Input
                value={editName}
                onChange={(e) => onEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onSaveRename()
                  }
                }}
                autoFocus
                aria-label={t('common.name')}
                className="h-9 flex-1 min-w-0"
              />
              {showShort ? (
                <Input
                  value={editShort}
                  onChange={(e) => onEditShort(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      onSaveRename()
                    }
                  }}
                  placeholder={t('catalog.shortPlaceholder')}
                  aria-label={t('catalog.shortPlaceholder')}
                  className="h-9 w-20 sm:w-24 shrink-0 num-ltr"
                />
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-emerald-600 hover:text-emerald-700"
                aria-label={t('common.save')}
                disabled={renameSaving || !canSaveRename}
                onClick={onSaveRename}
              >
                {renameSaving ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Check className="size-4" aria-hidden />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={t('common.cancel')}
                onClick={onCancelRename}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </>
          ) : (
            <>
              <span className="flex-1 min-w-0 text-sm truncate">{row.name}</span>
              {row.extra ? (
                <Badge variant="secondary" className="shrink-0 num-ltr">
                  {row.extra}
                </Badge>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={`${t('common.edit')}: ${row.name}`}
                onClick={() => onStartRename(row.id)}
              >
                <Pencil className="size-3.5" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-destructive hover:text-destructive"
                aria-label={`${t('common.delete')}: ${row.name}`}
                onClick={() => onDelete(row.id)}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}
