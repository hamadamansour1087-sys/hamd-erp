'use client'

import * as React from 'react'
import { ThemeProvider } from 'next-themes'
import { DirectionProvider } from '@radix-ui/react-direction'
import { X } from 'lucide-react'
import { toast } from 'sonner'

import { LanguageProvider, useI18n } from '@/lib/i18n'
import { useSession } from '@/stores/session'
import { initUIStore, useUIStore } from '@/stores/ui'
import { flushQueue, onQueueChange } from '@/lib/offline/queue'
import { registerSW } from '@/lib/pwa/register'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

function useOnline(): boolean {
  const [online, setOnline] = React.useState(true)
  React.useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    setOnline(navigator.onLine)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

function OfflineBanner() {
  const online = useOnline()
  const [dismissed, setDismissed] = React.useState(false)
  const { t } = useI18n()
  if (online || dismissed) return null
  return (
    <div className="sticky top-0 z-[60] w-full bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-b border-amber-300/60 text-sm">
      <div className="max-w-screen-2xl mx-auto px-3 py-1.5 flex items-center justify-center gap-2">
        <span aria-hidden>⚠️</span>
        <span>{t('shell.offlineBanner')}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 ms-2 rounded-full"
          onClick={() => setDismissed(true)}
          aria-label="dismiss"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

function PendingSyncChip() {
  const [pending, setPending] = React.useState(0)
  React.useEffect(() => onQueueChange(setPending), [])
  const { t } = useI18n()
  if (pending <= 0) return null
  return (
    <Badge
      variant="outline"
      className="fixed bottom-4 end-4 z-[70] bg-background shadow-md border-amber-400 text-amber-700 dark:text-amber-300"
    >
      ⟳ <span dir="auto">{t('shell.pendingSync', { n: pending })}</span>
    </Badge>
  )
}

function QueueFlusher() {
  const { t } = useI18n()
  React.useEffect(() => {
    let syncing = false
    const run = async () => {
      if (syncing) return
      syncing = true
      try {
        const res = await flushQueue()
        if (res.ok > 0) {
          toast.success(t('shell.syncedToast'))
          window.dispatchEvent(new CustomEvent('tijara-synced'))
        } else if (res.failed) {
          toast.warning(t('shell.syncFailedToast'))
        }
        if (res.held > 0) {
          toast.info(t('shell.syncHeldToast', { n: res.held }))
        }
      } finally {
        syncing = false
      }
    }
    const handleOnline = () => void run()
    window.addEventListener('online', handleOnline)
    if (typeof navigator !== 'undefined' && navigator.onLine && queueSizeNow() > 0) void run()
    return () => window.removeEventListener('online', handleOnline)
  }, [t])
  return null
}

function queueSizeNow(): number {
  try {
    const raw = localStorage.getItem('tijara-mq')
    return raw ? (JSON.parse(raw) as unknown[]).length : 0
  } catch {
    return 0
  }
}

function InnerProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <QueueFlusher />
      {children}
      <PendingSyncChip />
    </>
  )
}

/**
 * Radix primitives (Tabs, Select, DropdownMenu, Dialog, Popover…) resolve their
 * direction from Radix's own DirectionProvider context — NOT from `document.dir`.
 * Without this bridge every Radix root rendered `dir="ltr"`, leaving tab strips,
 * menus and popovers LTR-anchored even when the app is Arabic/RTL.
 */
function RadixDirectionBridge({ children }: { children: React.ReactNode }) {
  const { dir } = useI18n()
  return (
    <div data-dirbridge={dir} style={{ display: 'contents' }}>
      <DirectionProvider dir={dir}>{children}</DirectionProvider>
    </div>
  )
}

function LocaleBridge({ children }: { children: React.ReactNode }) {
  const org = useSession((s) => s.org)
  const currency = org?.currencyCode || 'EGP'
  return (
    <LanguageProvider currency={currency}>
      <RadixDirectionBridge>
        <InnerProviders>
          <OfflineBanner />
          {children}
        </InnerProviders>
      </RadixDirectionBridge>
    </LanguageProvider>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    initUIStore()
    registerSW()
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <LocaleBridge>{children}</LocaleBridge>
    </ThemeProvider>
  )
}
