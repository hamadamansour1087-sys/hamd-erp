'use client'

/**
 * Settings hub — Task 5-c (SettingsAuthAgent).
 * Tabs: Business profile · Appearance · Users · Data & backup · About (+PWA install).
 * Role-aware everywhere: CASHIER sees profile (read-only) + appearance + about;
 * MANAGER unlocks org editing; ADMIN gets users/data management.
 */

import * as React from 'react'
import { useTheme } from 'next-themes'
import {
  Building2,
  Check,
  DatabaseBackup,
  Download,
  Eraser,
  ImageOff,
  Info,
  LifeBuoy,
  Loader2,
  LockKeyhole,
  Palette,
  Pencil,
  Play,
  Settings as SettingsIcon,
  Trash2,
  TriangleAlert,
  Upload,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { toast } from 'sonner'

import { useI18n } from '@/lib/i18n'
import { useSession } from '@/stores/session'
import { useUIStore } from '@/stores/ui'
import { ApiError, requestJson, useApi } from '@/hooks/use-api'
import { CURRENCIES, round2Client } from '@/lib/format'
import { onQueueChange } from '@/lib/offline/queue'
import { cn } from '@/lib/utils'
import type { OrgDTO } from '@/lib/types'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  ACCENT_HEX,
  ACCENT_IDS,
  MODE_OPTIONS,
  compressLogoFile,
  initials,
  InstallAppCard,
  InstallSlimBanner,
  persistOrgPatch,
  roleBadgeClass,
  useInstaller,
  type Role,
  type UserRow,
} from './settings-parts'

type StaffRole = Extract<Role, 'ADMIN' | 'MANAGER'>

const isStaff = (role: string): role is StaffRole => role === 'ADMIN' || role === 'MANAGER'

// ═══════════════════════════════ TAB 1 · Business profile ═══════════════════════════════

function OrgTab({ role }: { role: Role }) {
  const { t, lang } = useI18n()
  const editable = isStaff(role)

  const [ready, setReady] = React.useState(false)
  const [loadErr, setLoadErr] = React.useState(false)
  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [address, setAddress] = React.useState('')
  const [currencyCode, setCurrencyCode] = React.useState('EGP')
  const [taxStr, setTaxStr] = React.useState('0')
  const [logo, setLogo] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [logoBusy, setLogoBusy] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  // initial load (deferred out of the effect body to satisfy react-hooks rules)
  React.useEffect(() => {
    let alive = true
    void Promise.resolve().then(async () => {
      try {
        const d = await requestJson<OrgDTO | null>('/api/settings/org', { method: 'GET' })
        if (!alive || !d) return
        setName(d.name ?? '')
        setPhone(d.phone ?? '')
        setAddress(d.address ?? '')
        setCurrencyCode(d.currencyCode ?? 'EGP')
        setTaxStr(String(d.taxPercent ?? 0))
        setLogo(d.logo ?? null)
      } catch {
        if (alive) setLoadErr(true)
      } finally {
        if (alive) setReady(true)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) {
      toast.error(t('set.invalidImage'))
      return
    }
    setLogoBusy(true)
    try {
      setLogo(await compressLogoFile(f))
    } catch {
      toast.error(t('set.invalidImage'))
    } finally {
      setLogoBusy(false)
    }
  }

  async function save() {
    const n = name.trim()
    if (!n) {
      toast.error(t('set.nameRequired'))
      return
    }
    const tax = Number.parseFloat(taxStr)
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) {
      toast.error(t('set.taxInvalid'))
      return
    }
    setSaving(true)
    try {
      const saved = await requestJson<OrgDTO>('/api/settings/org', {
        method: 'PUT',
        body: JSON.stringify({
          name: n,
          currencyCode,
          taxPercent: round2Client(tax),
          phone: phone.trim(),
          address: address.trim(),
          logo,
        }),
      })
      // runtime sync: currency/language context updates instantly, offline-safe via LS cache
      persistOrgPatch(saved)
      setName(saved.name ?? '')
      setCurrencyCode(saved.currencyCode ?? currencyCode)
      setTaxStr(String(saved.taxPercent ?? tax))
      setPhone(saved.phone ?? '')
      setAddress(saved.address ?? '')
      setLogo(saved.logo ?? null)
      toast.success(t('set.orgSaved'))
    } catch (e) {
      if (e instanceof ApiError && e.queued) toast.info(t('common.savedOffline'))
      else toast.error(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const taxNum = Number.parseFloat(taxStr)

  return (
    <div className="space-y-4">
      {!editable ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40">
          <LockKeyhole className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
          <div>
            <p className="text-sm font-semibold">{t('set.lockTitle')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('set.lockHintCashier')}</p>
          </div>
        </div>
      ) : null}

      {loadErr ? (
        <EmptyState icon={Info} title={t('common.error')} hint={t('boot.failed')} />
      ) : !ready ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <Card className="py-0 shadow-sm">
            <CardContent className="grid gap-x-4 gap-y-4 p-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="org-name">{t('set.nameField')} *</Label>
                <Input
                  id="org-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('set.namePlaceholder')}
                  disabled={!editable}
                  maxLength={80}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="org-currency">{t('set.currencyLabel')}</Label>
                <Select value={currencyCode} onValueChange={(v) => setCurrencyCode(v)} disabled={!editable}>
                  <SelectTrigger id="org-currency" className="w-full" aria-label={t('set.currencyLabel')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {lang === 'en' ? c.labelEn : c.labelAr}{' '}
                        <span className="num-ltr text-muted-foreground">({c.code})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="org-phone">{t('common.phone')}</Label>
                <Input
                  id="org-phone"
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="tel"
                  className="num-ltr text-start"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+20 100 123 4567"
                  disabled={!editable}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="org-address">{t('common.address')}</Label>
                <Input
                  id="org-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={lang === 'en' ? '12 El-Nasr St., Cairo' : '١٢ شارع النصر، القاهرة'}
                  disabled={!editable}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="org-tax">{t('set.taxLabel')}</Label>
                <Input
                  id="org-tax"
                  dir="ltr"
                  inputMode="decimal"
                  step="0.5"
                  min={0}
                  max={100}
                  className="num-ltr w-full sm:w-44 text-start"
                  value={taxStr}
                  onChange={(e) => setTaxStr(e.target.value)}
                  disabled={!editable}
                />
                <p className="text-xs text-muted-foreground">{t('set.taxHint')}</p>
              </div>

              {/* Logo */}
              <div className="space-y-2 sm:col-span-2">
                <Label>{t('set.logoLabel')}</Label>
                <div className="flex items-center gap-4">
                  <Avatar className="size-16 shrink-0 rounded-xl border shadow-sm">
                    {logo ? <AvatarImage src={logo} alt={t('set.logoLabel')} /> : null}
                    <AvatarFallback className="rounded-xl bg-primary font-extrabold text-primary-foreground">
                      ت
                    </AvatarFallback>
                  </Avatar>
                  {editable ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void onPickLogo(e)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileRef.current?.click()}
                        disabled={logoBusy}
                        className="gap-1.5"
                      >
                        {logoBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" aria-hidden />}
                        {logo ? t('set.replaceLogo') : t('set.uploadLogo')}
                      </Button>
                      {logo ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setLogo(null)}
                          disabled={logoBusy || saving}
                          className="gap-1.5 text-destructive hover:text-destructive"
                        >
                          <ImageOff className="size-4" aria-hidden />
                          {t('set.removeLogo')}
                        </Button>
                      ) : null}
                      <p className="w-full text-xs text-muted-foreground sm:hidden">{t('set.logoHint')}</p>
                    </div>
                  ) : null}
                </div>
                <p className="hidden text-xs text-muted-foreground sm:block">{t('set.logoHint')}</p>
              </div>
            </CardContent>
          </Card>

          {editable ? (
            <div className="flex justify-end">
              <Button onClick={() => void save()} disabled={saving || !Number.isFinite(taxNum)} className="min-w-36 gap-1.5">
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════ TAB 2 · Appearance ═══════════════════════════════

function AppearanceTab() {
  const { t } = useI18n()
  const { theme, setTheme } = useTheme()
  const accent = useUIStore((s) => s.accent)
  const setAccent = useUIStore((s) => s.setAccent)
  const [mounted, setMounted] = React.useState(false)

  // avoid hydration mismatch on persisted theme preference
  React.useEffect(() => {
    void Promise.resolve().then(() => setMounted(true))
  }, [])

  const currentMode = mounted ? (theme === 'light' || theme === 'dark' ? theme : 'system') : 'system'
  const modeLabel: Record<string, string> = {
    light: t('shell.theme.light'),
    dark: t('shell.theme.dark'),
    system: t('set.theme.system'),
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('set.appearanceSub')}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Day / night mode */}
        <Card className="py-0 shadow-sm">
          <CardContent className="p-5">
            <p className="font-semibold">{t('set.themeMode')}</p>
            <div
              role="radiogroup"
              aria-label={t('set.themeMode')}
              className="mt-3 grid grid-cols-3 gap-1 rounded-xl border bg-muted/30 p-1"
            >
              {MODE_OPTIONS.map(({ value, icon: Icon }) => {
                const active = currentMode === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTheme(value)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    <span className="truncate">{modeLabel[value]}</span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Accent color */}
        <Card className="py-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{t('shell.accent')}</p>
              <Badge variant="outline" className="pointer-events-none">
                {t(`accent.${accent}`)}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {ACCENT_IDS.map((id) => {
                const active = accent === id
                return (
                  <button
                    key={id}
                    type="button"
                    title={t(`accent.${id}`)}
                    aria-pressed={active}
                    aria-label={`${t('shell.accent')}: ${t(`accent.${id}`)}`}
                    onClick={() => setAccent(id)}
                    style={{ backgroundColor: ACCENT_HEX[id] }}
                    className={cn(
                      'relative flex size-10 items-center justify-center rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      active && 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                    )}
                  >
                    {active ? <Check className="size-5 text-white drop-shadow" aria-hidden /> : null}
                  </button>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {t('set.appliedAccent')}: <span className="font-medium text-foreground">{t(`accent.${accent}`)}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Live preview */}
      <Card className="shadow-sm">
        <CardContent className="space-y-4 p-5">
          <p className="text-sm font-semibold">{t('set.preview')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t('set.previewBadge')}</Badge>
            <Badge className="bg-primary text-primary-foreground">{t(`accent.${accent}`)}</Badge>
            <Badge variant="outline">H.A.M.D</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">{t('set.previewPrimary')}</Button>
            <Button size="sm" variant="outline">
              {t('set.previewSecondary')}
            </Button>
            <Button size="sm" variant="destructive">
              <Trash2 className="size-4" aria-hidden /> {t('common.delete')}
            </Button>
          </div>
          <Input placeholder={t('set.previewInputPh')} />
        </CardContent>
      </Card>
    </div>
  )
}

// ═══════════════════════════════ TAB 3 · Users (ADMIN) ═══════════════════════════════

function userErrorCodeToast(e: unknown, t: (k: string) => string) {
  let code = 'unknown'
  if (e instanceof ApiError) code = e.message
  switch (code) {
    case 'cannot-deactivate-self':
      toast.error(t('set.errSelfDeactivate'))
      break
    case 'cannot-demote-self':
      toast.error(t('set.errSelfDemote'))
      break
    case 'weak-password':
      toast.error(t('set.weakPassword'))
      break
    case 'email-taken':
      toast.error(t('auth.emailTaken'))
      break
    default:
      toast.error(t('common.error'))
  }
}

/** Add/edit dialog — mounted only while open so prefill stays fresh. */
function UserDialog({
  mode,
  target,
  onClose,
  onDone,
}: {
  mode: 'add' | 'edit'
  target: UserRow | null
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useI18n()
  const [name, setName] = React.useState(mode === 'edit' ? target?.name ?? '' : '')
  const [email, setEmail] = React.useState(mode === 'edit' ? target?.email ?? '' : '')
  const [password, setPassword] = React.useState('')
  const [role, setRole] = React.useState<Role>(target?.role ?? 'CASHIER')
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    if (mode === 'add') {
      if (!name.trim() || !email.trim() || password.length < 6) {
        toast.error(t('set.fillAll'))
        return
      }
    } else {
      if (!name.trim()) {
        toast.error(t('set.fillAll'))
        return
      }
      if (password.length > 0 && password.length < 6) {
        toast.error(t('set.weakPassword'))
        return
      }
    }
    setBusy(true)
    try {
      if (mode === 'add') {
        await requestJson('/api/users', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
        })
        toast.success(t('set.userAdded'))
      } else if (target) {
        const body: Record<string, unknown> = { name: name.trim(), role }
        if (password.length > 0) body.password = password
        await requestJson(`/api/users/${target.id}`, { method: 'PUT', body: JSON.stringify(body) })
        toast.success(t('set.userSaved'))
      }
      onDone()
      onClose()
    } catch (e) {
      userErrorCodeToast(e, t)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto scrollbar-thin sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? t('set.addUser') : t('set.editUser')}</DialogTitle>
          <DialogDescription>{t('set.addUserIntro')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="u-name">{t('common.name')} *</Label>
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-email">{t('auth.email')} *</Label>
            <Input
              id="u-email"
              dir="ltr"
              inputMode="email"
              autoComplete="off"
              className="num-ltr text-start"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={mode === 'edit'}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-role">{t('set.role')}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="u-role" className="w-full" aria-label={t('set.role')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['ADMIN', 'MANAGER', 'CASHIER'] as const).map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`role.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-pass">
              {mode === 'add' ? `${t('auth.password')} *` : t('set.newPassword')}
              {mode === 'edit' ? <span className="text-muted-foreground"> ({t('common.optional')})</span> : null}
            </Label>
            <Input
              id="u-pass"
              dir="ltr"
              type="password"
              autoComplete="new-password"
              className="num-ltr text-start"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <p className="text-xs text-muted-foreground">{t('set.pwMin')}</p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UsersTabAdmin({ selfId }: { selfId: string }) {
  const { t } = useI18n()
  const users = useApi<UserRow[]>('/api/users')
  const [dialogState, setDialogState] = React.useState<{ mode: 'add' | 'edit'; target: UserRow | null } | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const rows = users.data ?? []

  async function toggleActive(u: UserRow) {
    setBusyId(u.id)
    try {
      await requestJson(`/api/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !u.active }),
      })
      toast.success(t('set.userSaved'))
      users.refetch()
    } catch (e) {
      userErrorCodeToast(e, t)
    } finally {
      setBusyId(null)
    }
  }

  function renderRow(u: UserRow, compact: boolean) {
    const isSelf = u.id === selfId
    if (compact) {
      return (
        <Card key={u.id} className={cn('py-0 shadow-sm', !u.active && 'opacity-70')}>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <Avatar className="size-9 shrink-0">
              <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                {initials(u.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {u.name}
                {isSelf ? (
                  <Badge variant="secondary" className="ms-1.5 pointer-events-none">
                    {t('set.youBadge')}
                  </Badge>
                ) : null}
              </p>
              <p dir="ltr" className="num-ltr truncate text-xs text-muted-foreground">
                {u.email}
              </p>
            </div>
            <Badge variant="outline" className={cn('pointer-events-none', roleBadgeClass(u.role))}>
              {t(`role.${u.role}`)}
            </Badge>
            <div className="flex items-center gap-2">
              <Switch
                checked={u.active}
                disabled={busyId === u.id}
                onCheckedChange={() => void toggleActive(u)}
                aria-label={t('set.toggleActiveAria', { name: u.name })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setDialogState({ mode: 'edit', target: u })}
                aria-label={`${t('common.edit')}: ${u.name}`}
              >
                <Pencil className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )
    }
    return (
      <tr key={u.id} className={cn('border-b transition-colors last:border-b-0 hover:bg-muted/40', !u.active && 'opacity-70')}>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="bg-primary/10 text-[11px] font-bold text-primary">
                {initials(u.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {u.name}
                {isSelf ? (
                  <Badge variant="secondary" className="ms-2 pointer-events-none">
                    {t('set.youBadge')}
                  </Badge>
                ) : null}
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span dir="ltr" className="num-ltr block truncate text-xs text-muted-foreground" title={u.email}>
            {u.email}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <Badge variant="outline" className={cn('pointer-events-none', roleBadgeClass(u.role))}>
            {t(`role.${u.role}`)}
          </Badge>
        </td>
        <td className="px-3 py-2.5">
          <Switch
            checked={u.active}
            disabled={busyId === u.id}
            onCheckedChange={() => void toggleActive(u)}
            aria-label={t('set.toggleActiveAria', { name: u.name })}
          />
        </td>
        <td className="px-3 py-2.5 text-end">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setDialogState({ mode: 'edit', target: u })}
            aria-label={`${t('common.edit')}: ${u.name}`}
          >
            <Pencil className="size-4" />
          </Button>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('set.usersSub')}</p>
        <Button size="sm" onClick={() => setDialogState({ mode: 'add', target: null })} className="gap-1.5">
          <UserPlus className="size-4" aria-hidden />
          {t('set.addUser')}
        </Button>
      </div>

      {users.loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : users.error ? (
        <EmptyState icon={Info} title={t('common.error')} hint={t('common.retry')} />
      ) : rows.length === 0 ? (
        <EmptyState icon={UsersRound} title={t('set.noUsersYet')} hint={t('common.noData')} />
      ) : (
        <>
          {/* desktop table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 text-start text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 text-start font-medium">{t('common.name')}</th>
                  <th className="px-3 py-2.5 text-start font-medium">{t('set.colEmail')}</th>
                  <th className="px-3 py-2.5 text-start font-medium">{t('set.role')}</th>
                  <th className="px-3 py-2.5 text-start font-medium">{t('set.active')}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>{rows.map((u) => renderRow(u, false))}</tbody>
            </table>
          </div>
          {/* mobile cards */}
          <div className="space-y-2 md:hidden">{rows.map((u) => renderRow(u, true))}</div>
        </>
      )}

      {/* Deleting users is intentionally NOT offered — deactivation covers leave-of-absence */}
      {dialogState ? (
        <UserDialog
          mode={dialogState.mode}
          target={dialogState.target}
          onClose={() => setDialogState(null)}
          onDone={() => users.refetch()}
        />
      ) : null}
    </div>
  )
}

/** MANAGER sees the list entry point as a friendly lock (mutations are ADMIN-only server-side). */
function UsersLockedNote() {
  const { t } = useI18n()
  return (
    <EmptyState
      icon={LockKeyhole}
      title={t('set.lockTitle')}
      hint={t('set.lockHintManager')}
    />
  )
}

// ═══════════════════════════════ TAB 4 · Data & backup (ADMIN) ═══════════════════════════════

function DataTab() {
  const { t } = useI18n()
  const [pending, setPending] = React.useState(0)
  const [confirmQueueOpen, setConfirmQueueOpen] = React.useState(false)

  React.useEffect(() => onQueueChange(setPending), [])

  function clearCachedStorage() {
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('tijara-get:')) keys.push(k)
      }
      keys.forEach((k) => localStorage.removeItem(k))
    } catch {}
    toast.success(t('set.cacheCleared'))
    window.setTimeout(() => window.location.reload(), 650)
  }

  function clearPendingQueue() {
    try {
      localStorage.removeItem('tijara-mq')
    } catch {}
    toast.success(t('set.queueCleared'))
    window.setTimeout(() => window.location.reload(), 650)
  }

  return (
    <div className="space-y-4">
      {/* Backup */}
      <Card className="py-0 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <DatabaseBackup className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t('set.backupTitle')}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('set.backupDesc')}</p>
          </div>
          <Button variant="outline" className="gap-1.5 sm:self-center" onClick={() => window.open('/api/export', '_blank')}>
            <Download className="size-4" aria-hidden />
            {t('common.exportJson')}
          </Button>
        </CardContent>
      </Card>

      {/* Maintenance / danger zone */}
      <Card className="border-destructive/40 py-0 shadow-sm">
        <CardContent className="space-y-5 p-5">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <TriangleAlert className="size-4.5" aria-hidden />
            {t('set.dangerZone')}
          </p>

          {/* cached GET fallbacks */}
          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold">{t('set.cacheTitle')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('set.cacheDesc')}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={clearCachedStorage}
              className="mt-3 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Eraser className="size-4" aria-hidden />
              {t('set.clearCache')}
            </Button>
          </div>

          {/* offline mutation queue */}
          <div className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{t('set.queueTitle')}</p>
              {pending > 0 ? (
                <Badge variant="outline" className="pointer-events-none border-amber-400 text-amber-700 dark:text-amber-300">
                  ⟳ {t('shell.pendingSync', { n: pending })}
                </Badge>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="size-3.5" aria-hidden />
                  {t('set.queueEmpty')}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmQueueOpen(true)}
              disabled={pending <= 0}
              className="mt-3 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden />
              {t('set.clearQueue')}
            </Button>
          </div>

          {/* honest full-reset info panel */}
          <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-4">
            <LifeBuoy className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-sm font-semibold">{t('set.resetInfoTitle')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('set.resetInfo')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmQueueOpen} onOpenChange={setConfirmQueueOpen}>
        <AlertDialogContent className="max-h-[85dvh] overflow-y-auto scrollbar-thin">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('set.queueConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('set.queueClearWarn', { n: pending })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmQueueOpen(false)
                clearPendingQueue()
              }}
              className={cn(
                'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40'
              )}
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ═══════════════════════════════ TAB 5 · About (+ PWA install) ═══════════════════════════════

/** Tutorial videos (Arabic text slides + background music) served from /videos. */
const TUTORIAL_VIDEOS = [
  { id: 'v-intro', title: 'جولة تعريفية بالنظام', desc: 'كل ما تحتاج معرفته في أقل من دقيقة', dur: '٠:٤٤' },
  { id: 'v-pos', title: 'نقطة البيع خطوة بخطوة', desc: 'من الباركود لإصدار الفاتورة وسند القبض', dur: '٠:٤٤' },
  { id: 'v-stock', title: 'إدارة المخازن والمخزون', desc: 'أرصدة، تحويلات، جرد، وتنبيهات النقص', dur: '٠:٤٤' },
  { id: 'v-reports', title: 'الفواتير والتقارير والإعدادات', desc: 'صمّم فاتورتك وتابع أرباحك', dur: '٠:٤٤' },
] as const

function TutorialVideosCard() {
  const { t } = useI18n()
  const [open, setOpen] = React.useState<string | null>(null)

  return (
    <Card className="py-0 shadow-sm">
      <CardContent className="space-y-3 p-5">
        <p className="text-sm font-semibold">{t('set.videos.title')}</p>
        <p className="text-xs text-muted-foreground">{t('set.videos.sub')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TUTORIAL_VIDEOS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setOpen(v.id)}
              className="group flex min-h-11 items-center gap-3 rounded-xl border bg-card p-2.5 text-start transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground" aria-hidden>
                <Play className="size-4 fill-current" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold" dir="auto">{v.title}</span>
                <span className="block truncate text-xs text-muted-foreground" dir="auto">{v.desc}</span>
              </span>
              <Badge variant="outline" className="shrink-0 num-ltr">{v.dur}</Badge>
            </button>
          ))}
        </div>
      </CardContent>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle dir="auto">
              {TUTORIAL_VIDEOS.find((v) => v.id === open)?.title ?? ''}
            </DialogTitle>
            <DialogDescription dir="auto">{t('set.videos.sub')}</DialogDescription>
          </DialogHeader>
          {open ? (
            <video
              key={open}
              controls
              autoPlay
              className="aspect-video w-full rounded-lg bg-black"
              src={`/videos/${open}.mp4`}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function AboutTab() {
  const { t } = useI18n()
  const installAvailable = useInstaller() !== null

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('set.aboutSub')}</p>

      {/* brand / version */}
      <Card className="py-0 shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary text-2xl font-extrabold text-primary-foreground shadow-sm select-none">
            H
          </div>
          <div>
            <p className="text-xl font-extrabold">{t('app.name')}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('app.tagline')}</p>
          </div>
          <Badge variant="outline" className="num-ltr pointer-events-none">
            {t('footer.version')}
          </Badge>
        </CardContent>
      </Card>

      {/* install prompt appears here automatically when the browser offers one */}
      {installAvailable ? <InstallAppCard /> : null}

      {/* tutorial videos */}
      <TutorialVideosCard />
    </div>
  )
}

// ═══════════════════════════════ Shell ═══════════════════════════════

type TabKey = 'org' | 'appearance' | 'users' | 'data' | 'about'

export default function SettingsView() {
  const { t } = useI18n()
  const sessionRole = useSession((s) => s.user?.role)
  // SUPERADMIN never reaches the tenant settings (platform console instead);
  // narrowing keeps the shared Role contract honest.
  const role: Role = sessionRole === 'SUPERADMIN' ? 'ADMIN' : (sessionRole ?? 'ADMIN')
  const selfId = useSession((s) => s.user?.id) ?? ''
  const [tab, setTab] = React.useState<TabKey>('org')

  const TAB_ITEMS: Array<{ key: TabKey; label: string; icon: typeof SettingsIcon }> = [
    { key: 'org', label: t('set.tab.org'), icon: Building2 },
    { key: 'appearance', label: t('set.tab.appearance'), icon: Palette },
    ...(role !== 'CASHIER' ? [{ key: 'users' as const, label: t('set.tab.users'), icon: UsersRound }] : []),
    ...(role === 'ADMIN' ? [{ key: 'data' as const, label: t('set.tab.data'), icon: DatabaseBackup }] : []),
    { key: 'about', label: t('set.tab.about'), icon: SettingsIcon },
  ]

  const safeTab: TabKey = TAB_ITEMS.some((it) => it.key === tab) ? tab : 'org'

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        icon={<SettingsIcon className="size-5" aria-hidden />}
        title={t('nav.settings')}
        subtitle={t('set.subtitle')}
      />

      {/* PWA install banner — settings-local only (global shell untouched) */}
      <InstallSlimBanner />

      <Tabs value={safeTab} onValueChange={(v) => setTab(v as TabKey)}>
        {/* mobile tab switcher */}
        <div className="md:hidden">
          <Select value={safeTab} onValueChange={(v) => setTab(v as TabKey)}>
            <SelectTrigger className="w-full" aria-label={t('nav.settings')}>
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
        <TabsList className="hidden w-full max-w-3xl md:flex">
          {TAB_ITEMS.map((it) => (
            <TabsTrigger key={it.key} value={it.key} className="min-w-0 flex-1 gap-1.5 px-2 lg:px-3">
              <it.icon className="size-4" aria-hidden />
              <span className="truncate">{it.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="org" className="mt-4">
          <OrgTab role={role} />
        </TabsContent>

        <TabsContent value="appearance" className="mt-4">
          <AppearanceTab />
        </TabsContent>

        {role !== 'CASHIER' ? (
          <TabsContent value="users" className="mt-4">
            {role === 'ADMIN' ? <UsersTabAdmin selfId={selfId} /> : <UsersLockedNote />}
          </TabsContent>
        ) : null}

        {role === 'ADMIN' ? (
          <TabsContent value="data" className="mt-4">
            <DataTab />
          </TabsContent>
        ) : null}

        <TabsContent value="about" className="mt-4">
          <AboutTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
