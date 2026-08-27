'use client'

import * as React from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppShell } from '@/components/shell/app-shell'
import { ActiveView } from '@/views/registry'
import AuthView from '@/views/auth/AuthView'
import LandingPage from '@/views/landing/LandingPage'
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

  return (
    <AppShell>
      <ActiveView view={view} />
    </AppShell>
  )
}

export default function Page() {
  return <Gate />
}
