'use client'

import * as React from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppShell } from '@/components/shell/app-shell'
import { ActiveView } from '@/views/registry'
import AuthView from '@/views/auth/AuthView'
import LandingPage from '@/views/landing/LandingPage'
import PlatformView from '@/views/platform/PlatformView'
import { useSession } from '@/stores/session'
import { canAccess, useUIStore } from '@/stores/ui'
import { useI18n } from '@/lib/i18n'

function Gate() {
  const user = useSession((s) => s.user)
  const booted = useSession((s) => s.booted)
  const bootstrap = useSession((s) => s.bootstrap)
  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)
  const role = useSession((s) => s.user?.role ?? 'ADMIN')
  const [showAuth, setShowAuth] = React.useState(false)
  const { t } = useI18n()

  React.useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  // DB KEEP-ALIVE (POS idle pattern): a shop keeps the app open but clicks
  // sporadically — >5 quiet minutes lets the serverless database autosuspend,
  // so the NEXT click pays a ~0.5-1.5s cold-start wake on top of the request.
  // A tiny /api/health (SELECT 1) ping every 4 minutes while an authenticated
  // session is on screen keeps the database warm for exactly this usage
  // pattern. Skipped in hidden tabs and while offline — no wasted requests.
  React.useEffect(() => {
    if (!user) return
    const ping = () => {
      try {
        if (document.hidden || !navigator.onLine) return
        void fetch('/api/health', { keepalive: true }).catch(() => {})
      } catch {}
    }
    const id = window.setInterval(ping, 4 * 60_000)
    return () => window.clearInterval(id)
  }, [user])

  // Re-bootstrap when connection returns (session may be fresh)
  React.useEffect(() => {
    const onOnline = () => void bootstrap()
    window.addEventListener('online', onOnline)
    window.addEventListener('tijara-synced', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('tijara-synced', onOnline)
    }
  }, [bootstrap])

  // Enforce cashier permissions: bounce them to an allowed view
  React.useEffect(() => {
    if (user && !canAccess(role, view)) setView('pos')
  }, [user, role, view, setView])

  if (!booted) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background"
        suppressHydrationWarning
      >
        <div
          className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-2xl font-extrabold shadow-lg animate-pulse"
          aria-hidden
          suppressHydrationWarning
        >
          H
        </div>
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          suppressHydrationWarning
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('boot.init')}
        </p>
      </div>
    )
  }

  if (!user) {
    if (showAuth) {
      return (
        <>
          <Button
            variant="ghost"
            onClick={() => setShowAuth(false)}
            className="fixed end-4 top-4 z-50 h-11 gap-1.5 border bg-background/80 px-4 shadow-sm backdrop-blur"
          >
            <ArrowRight className="size-4" aria-hidden />
            الرئيسية
          </Button>
          <AuthView />
        </>
      )
    }
    return <LandingPage onAuth={() => setShowAuth(true)} />
  }

  // PLATFORM CONSOLE: the company super-admin never enters a tenant shell —
  // their session renders the subscribers console instead (see PlatformView).
  if (user.role === 'SUPERADMIN') {
    return <PlatformView />
  }

  return (
    <AppShell>
      <ActiveView view={view} />
    </AppShell>
  )
}

export default function Page() {
  return <Gate />
}
