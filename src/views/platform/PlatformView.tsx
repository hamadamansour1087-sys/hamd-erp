'use client'

/**
 * PLATFORM CONSOLE — H.A.M.D staff only (role SUPERADMIN).
 *
 * Rendered INSTEAD of the tenant AppShell: a super-admin is not part of any
 * tenant workspace, so mounting the tenant shell would leak tenant nav/links.
 * This view is intentionally self-contained: stats, pending approval queue,
 * and the full tenant table with lifecycle actions.
 *
 * All strings are Arabic literals (internal back-office tool; the marketing
 * app is the bilingual surface). Actions map 1:1 to POST /api/platform/orgs/[id].
 */

import * as React from 'react'
import {
  BadgeCheck,
  Building2,
  Clock,
  Hourglass,
  LogOut,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSession } from '@/stores/session'

type OrgStatus = 'PENDING' | 'TRIAL' | 'ACTIVE' | 'SUSPENDED'

interface OrgRow {
  id: string
  name: string
  phone: string | null
  status: OrgStatus
  trialEndsAt: string | null
  approvedAt: string | null
  createdAt: string
  ownerName: string | null
  ownerEmail: string | null
  usersCount: number
  productsCount: number
  invoicesCount: number
  isPlatformOrg: boolean
}

interface Stats {
  total: number
  pending: number
  trial: number
  active: number
  suspended: number
}

const STATUS_META: Record<OrgStatus, { label: string; cls: string }> = {
  PENDING: { label: 'قيد المراجعة', cls: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' },
  TRIAL: { label: 'تجريبي', cls: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800' },
  ACTIVE: { label: 'مفعّل', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800' },
  SUSPENDED: { label: 'موقوف', cls: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800' },
}

function fmtDate(v: string | null): string {
  if (!v) return '—'
  try {
    return new Date(v).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return v
  }
}

function daysLeft(v: string | null): number | null {
  if (!v) return null
  return Math.max(0, Math.ceil((new Date(v).getTime() - Date.now()) / 86_400_000))
}

export default function PlatformView() {
  const user = useSession((s) => s.user)
  const logout = useSession((s) => s.logout)
  const [rows, setRows] = React.useState<OrgRow[]>([])
  const [stats, setStats] = React.useState<Stats | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [q, setQ] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | OrgStatus>('ALL')
  const [deleteTarget, setDeleteTarget] = React.useState<OrgRow | null>(null)
  const [extendDays, setExtendDays] = React.useState('14')

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/platform/orgs', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) {
        toast.error('تعذّر تحميل البيانات')
        return
      }
      setRows(json.data.orgs as OrgRow[])
      setStats(json.data.stats as Stats)
    } catch {
      toast.error('تعذّر الاتصال بالسيرفر')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  async function act(org: OrgRow, action: string, days?: number) {
    setBusyId(org.id)
    try {
      const res = await fetch(`/api/platform/orgs/${org.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, days }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msgs: Record<string, string> = {
          'not-pending': 'هذا الطلب ليس في حالة "قيد المراجعة"',
          'cannot-touch-platform-org': 'لا يمكن تنفيذ هذا الإجراء على منظمة المنصة نفسها',
          'org-not-found': 'المنظمة غير موجودة (ربما حُذفت)',
        }
        toast.error(msgs[json.error] ?? 'فشل تنفيذ الإجراء')
        return
      }
      const okMsgs: Record<string, string> = {
        approve: `تمت الموافقة — فترة تجريبية ${days ?? 14} يوم`,
        activate: 'تم تفعيل الحساب بالكامل',
        trial: `تم منح فترة تجريبية ${days ?? 14} يوم`,
        suspend: 'تم إيقاف الحساب',
        extend: `تم التمديد ${days ?? 14} يوم`,
        delete: 'تم حذف المنظمة نهائيًا',
      }
      toast.success(okMsgs[action] ?? 'تم')
      await load()
    } catch {
      toast.error('تعذّر الاتصال بالسيرفر')
    } finally {
      setBusyId(null)
    }
  }

  const filtered = rows.filter((r) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
    if (!q.trim()) return true
    const needle = q.trim().toLowerCase()
    return (
      r.name.toLowerCase().includes(needle) ||
      (r.ownerName ?? '').toLowerCase().includes(needle) ||
      (r.ownerEmail ?? '').toLowerCase().includes(needle) ||
      (r.phone ?? '').includes(needle)
    )
  })

  const pendingRows = filtered.filter((r) => r.status === 'PENDING' && !r.isPlatformOrg)
  const otherRows = filtered.filter((r) => !(r.status === 'PENDING' && !r.isPlatformOrg))

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col" dir="rtl">
      {/* header */}
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <span
            aria-hidden
            className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-700 text-lg font-extrabold text-white shadow"
          >
            H
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold leading-tight">H.A.M.D — لوحة إدارة المشتركين</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
              تحديث
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void logout()}
              className="gap-1.5 text-muted-foreground"
            >
              <LogOut className="size-4" aria-hidden />
              خروج
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {/* stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { label: 'إجمالي العملاء', value: stats?.total, icon: Building2, cls: 'text-foreground' },
            { label: 'قيد المراجعة', value: stats?.pending, icon: Clock, cls: 'text-amber-600' },
            { label: 'تجريبي', value: stats?.trial, icon: Hourglass, cls: 'text-sky-600' },
            { label: 'مفعّل', value: stats?.active, icon: BadgeCheck, cls: 'text-emerald-600' },
            { label: 'موقوف', value: stats?.suspended, icon: PauseCircle, cls: 'text-rose-600' },
          ].map((s) => (
            <Card key={s.label} className="py-0">
              <CardContent className="flex items-center gap-3 p-4">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted ${s.cls}`}>
                  <s.icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-2xl font-black leading-none tabular-nums">
                    {s.value ?? <span className="inline-block h-6 w-10 animate-pulse rounded bg-muted" />}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* filters */}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث باسم المنشأة أو المالك أو البريد أو الهاتف…"
              className="ps-9"
              aria-label="بحث في المشتركين"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'ALL' | OrgStatus)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="تصفية بالحالة">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">كل الحالات</SelectItem>
              {(Object.keys(STATUS_META) as OrgStatus[]).map((st) => (
                <SelectItem key={st} value={st}>
                  {STATUS_META[st].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* pending queue */}
        <section className="mt-8" aria-label="طلبات التسجيل الجديدة">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Clock className="size-5 text-amber-600" aria-hidden />
            طلبات بانتظار الموافقة
            {stats && stats.pending > 0 ? (
              <Badge className="bg-amber-500 text-white">{stats.pending}</Badge>
            ) : null}
          </h2>
          {loading ? (
            <p className="mt-3 text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : pendingRows.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              لا توجد طلبات جديدة — كل الطلبات تمت مراجعتها ✓
            </p>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {pendingRows.map((r) => (
                <Card key={r.id} className="py-0">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{r.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {r.ownerName} · <span dir="ltr">{r.ownerEmail}</span>
                        </p>
                        {r.phone ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground" dir="ltr">
                            {r.phone}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">طلب بتاريخ {fmtDate(r.createdAt)}</p>
                      </div>
                      <Badge variant="outline" className={STATUS_META[r.status].cls}>
                        {STATUS_META[r.status].label}
                      </Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        disabled={busyId === r.id}
                        onClick={() => void act(r, 'approve', 14)}
                        className="gap-1.5"
                      >
                        <BadgeCheck className="size-4" aria-hidden />
                        موافقة + تجربة ١٤ يوم
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === r.id}
                        onClick={() => void act(r, 'activate')}
                      >
                        تفعيل مباشر (مدفوع)
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === r.id}
                        onClick={() => setDeleteTarget(r)}
                        className="gap-1.5 text-rose-600 hover:text-rose-700"
                      >
                        <Trash2 className="size-4" aria-hidden />
                        رفض
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* all orgs table */}
        <section className="mt-10" aria-label="كل المشتركين">
          <h2 className="text-lg font-extrabold">كل المشتركين</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-44">المنشأة</TableHead>
                  <TableHead className="min-w-44">المالك</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>نهاية التجربة</TableHead>
                  <TableHead className="text-center">مستخدمون</TableHead>
                  <TableHead className="text-center">أصناف</TableHead>
                  <TableHead className="text-center">فواتير</TableHead>
                  <TableHead className="min-w-56">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      جارٍ التحميل…
                    </TableCell>
                  </TableRow>
                ) : otherRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      لا توجد نتائج مطابقة
                    </TableCell>
                  </TableRow>
                ) : (
                  otherRows.map((r) => {
                    const dl = daysLeft(r.trialEndsAt)
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <p className="font-semibold">
                            {r.name}
                            {r.isPlatformOrg ? (
                              <ShieldCheck className="ms-1.5 inline size-4 text-primary" aria-label="منظمة المنصة" />
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground">أُنشئت {fmtDate(r.createdAt)}</p>
                        </TableCell>
                        <TableCell>
                          <p className="truncate text-sm">{r.ownerName ?? '—'}</p>
                          {r.ownerEmail ? (
                            <p className="truncate text-xs text-muted-foreground" dir="ltr">
                              {r.ownerEmail}
                            </p>
                          ) : null}
                          {r.phone ? (
                            <p className="truncate text-xs text-muted-foreground" dir="ltr">
                              {r.phone}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_META[r.status].cls}>
                            {STATUS_META[r.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.status === 'TRIAL' && dl !== null ? (
                            <span className={dl <= 3 ? 'font-bold text-rose-600' : ''}>
                              {fmtDate(r.trialEndsAt)}
                              <span className="block text-xs text-muted-foreground">متبقٍ {dl} يوم</span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{r.usersCount}</TableCell>
                        <TableCell className="text-center tabular-nums">{r.productsCount}</TableCell>
                        <TableCell className="text-center tabular-nums">{r.invoicesCount}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {r.status !== 'ACTIVE' && !r.isPlatformOrg ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 px-2 text-xs"
                                disabled={busyId === r.id}
                                onClick={() => void act(r, 'activate')}
                              >
                                <PlayCircle className="size-3.5" aria-hidden />
                                تفعيل
                              </Button>
                            ) : null}
                            {r.status !== 'SUSPENDED' && !r.isPlatformOrg ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 px-2 text-xs text-amber-700"
                                disabled={busyId === r.id}
                                onClick={() => void act(r, 'suspend')}
                              >
                                <PauseCircle className="size-3.5" aria-hidden />
                                إيقاف
                              </Button>
                            ) : null}
                            {!r.isPlatformOrg ? (
                              <>
                                <Input
                                  type="number"
                                  min={1}
                                  max={365}
                                  value={extendDays}
                                  onChange={(e) => setExtendDays(e.target.value)}
                                  className="h-8 w-16 text-center text-xs"
                                  aria-label="أيام التمديد"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 gap-1 px-2 text-xs"
                                  disabled={busyId === r.id}
                                  onClick={() => void act(r, 'extend', Number(extendDays) || 14)}
                                >
                                  <Hourglass className="size-3.5" aria-hidden />
                                  تمديد
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 gap-1 px-2 text-xs text-rose-600"
                                  disabled={busyId === r.id}
                                  onClick={() => setDeleteTarget(r)}
                                >
                                  <Trash2 className="size-3.5" aria-hidden />
                                  حذف
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t bg-muted/40 py-3 text-center text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <UserRound className="size-3.5" aria-hidden />
          لوحة خاصة بشركة H.A.M.D — الإجراءات هنا تُطبَّق فورًا على دخول العملاء
        </span>
      </footer>

      {/* delete confirm */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف النهائي</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف منظمة «{deleteTarget?.name}» مع كل مستخدميها ومنتجاتها وفواتيرها وحركاتها —
              لا يمكن التراجع عن هذه الخطوة إطلاقًا. للرفض على الطلبات الجديدة هذا هو الإجراء الصحيح.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse justify-start gap-2">
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => {
                const target = deleteTarget
                setDeleteTarget(null)
                if (target) void act(target, 'delete')
              }}
            >
              حذف نهائي
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
