'use client'

/**
 * Private helpers for SettingsView (Task 5-c) — not shared outside views/settings.
 * Contains: accent constants, logo compression, session org patching, PWA install flow.
 */

import * as React from 'react'
import { Download, Monitor, Moon, Smartphone, Sun, X } from 'lucide-react'
import { toast } from 'sonner'

import { useI18n } from '@/lib/i18n'
import { useSession } from '@/stores/session'
import type { OrgDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  getInstallPrompt,
  onInstallAvailability,
  clearInstallPrompt,
  type BeforeInstallPromptEvent,
} from '@/lib/pwa/register'

// ---------- Accent palettes ----------
export const ACCENT_IDS = ['emerald', 'teal', 'amber', 'rose', 'violet'] as const
export const ACCENT_HEX: Record<(typeof ACCENT_IDS)[number], string> = {
  emerald: '#059669',
  teal: '#0d9488',
  amber: '#d97706',
  rose: '#e11d48',
  violet: '#7c3aed',
}

export type Role = 'ADMIN' | 'MANAGER' | 'CASHIER'

/** Team row returned by GET /api/users */
export interface UserRow {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  createdAt: string
}

export function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || '?'
}

export function roleBadgeClass(role: Role): string {
  switch (role) {
    case 'ADMIN':
      return 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
    case 'MANAGER':
      return 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
    default:
      return ''
  }
}

// ---------- Org save → instant runtime sync ----------
/**
 * Merge a freshly-saved org into the session store + persisted boot cache so the
 * currency/language context and offline fallbacks update instantly (no refetch).
 */
export function persistOrgPatch(org: OrgDTO) {
  try {
    if (org.currencyCode) localStorage.setItem('tijara-currency', org.currencyCode)
    const raw = localStorage.getItem('tijara-boot-cache')
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      parsed.org = org
      localStorage.setItem('tijara-boot-cache', JSON.stringify(parsed))
    }
  } catch {}
  useSession.setState({ org })
}

// ---------- Logo compression (max height 160px, JPEG q0.85) ----------
export async function compressLogoFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image-load-failed'))
      el.src = url
    })
    const scale = Math.min(1, 160 / Math.max(1, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas-unavailable')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ---------- PWA install flow ----------
/** Subscribe to install-prompt availability; null while not installable / already installed. */
export function useInstaller(): BeforeInstallPromptEvent | null {
  const [evt, setEvt] = React.useState<BeforeInstallPromptEvent | null>(null)
  React.useEffect(() => {
    const sync = () => setEvt(getInstallPrompt())
    void Promise.resolve().then(sync)
    return onInstallAvailability(sync)
  }, [])
  return evt
}

/** Fire the deferred native prompt; resolves with the user's choice (or null when unavailable). */
export async function triggerInstall(): Promise<'accepted' | 'dismissed' | null> {
  const evt = getInstallPrompt()
  if (!evt) return null
  try {
    await evt.prompt()
    const choice = await evt.userChoice
    clearInstallPrompt()
    return choice.outcome
  } catch {
    return null
  }
}

/** Slim dismissible install banner rendered inside Settings only (global shell untouched). */
export function InstallSlimBanner() {
  const evt = useInstaller()
  const { t } = useI18n()
  const [dismissed, setDismissed] = React.useState(false)
  if (!evt || dismissed) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <Smartphone className="size-5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-sm font-medium">{t('set.installDesc')}</p>
      <Button
        size="sm"
        onClick={async () => {
          const r = await triggerInstall()
          if (r === 'accepted') toast.success(t('set.installed'))
          else if (r === 'dismissed') toast.info(t('set.installDismissed'))
        }}
        className="gap-1.5"
      >
        <Download className="size-4" aria-hidden />
        {t('shell.installApp')}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 rounded-full text-muted-foreground"
        onClick={() => setDismissed(true)}
        aria-label={t('common.close')}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}

/** Full install card shown in the About tab when the browser exposes a deferred prompt. */
export function InstallAppCard() {
  const evt = useInstaller()
  const { t } = useI18n()
  const [busy, setBusy] = React.useState(false)
  if (!evt) return null
  return (
    <Card className="border-primary/30 bg-primary/5 shadow-none py-0">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Smartphone className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t('set.installTitle')}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('set.installDesc')}</p>
        </div>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const r = await triggerInstall()
              if (r === 'accepted') toast.success(t('set.installed'))
              else if (r === 'dismissed') toast.info(t('set.installDismissed'))
            } finally {
              setBusy(false)
            }
          }}
          className="gap-1.5 sm:self-center"
        >
          <Download className="size-4" aria-hidden />
          {busy ? t('common.loading') : t('shell.installApp')}
        </Button>
      </CardContent>
    </Card>
  )
}

/** Three-way mode segmenter option meta (icons kept local to avoid extra props plumbing). */
export const MODE_OPTIONS = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
] as const
