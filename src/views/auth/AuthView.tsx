'use client'

import * as React from 'react'
import { BarChart3, Boxes, Copy, Eye, EyeOff, Loader2, Package, WifiOff, Zap } from 'lucide-react'
import { toast } from 'sonner'

import { useI18n } from '@/lib/i18n'
import { useSession } from '@/stores/session'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import type { OrgDTO, SessionUser } from '@/lib/types'

const DEMO = { email: 'admin@tijara.app', password: '123456' }
const LOGIN_HINT_KEY = 'tijara-login-hint'

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    throw new Error('no-clipboard')
  } catch {
    // fallback for older WebView / non-secure contexts
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const okFlag = document.execCommand('copy')
      document.body.removeChild(ta)
      return okFlag
    } catch {
      return false
    }
  }
}

export default function AuthView() {
  const setSession = useSession((s) => s.setSession)
  const { t } = useI18n()
  const [mode, setMode] = React.useState<'login' | 'register'>('login')
  const [busy, setBusy] = React.useState(false)

  // login fields
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPw, setShowPw] = React.useState(false)
  const [remember, setRemember] = React.useState(false)

  // register fields
  const [orgName, setOrgName] = React.useState('')
  const [name, setName] = React.useState('')
  const [rEmail, setREmail] = React.useState('')
  const [rPassword, setRPassword] = React.useState('')
  const [showRPw, setShowRPw] = React.useState(false)

  const emailRef = React.useRef<HTMLInputElement>(null)

  // prefill remembered email + single auto-focus of the email field (deferred out of effect body)
  React.useEffect(() => {
    void Promise.resolve().then(() => {
      let hint = ''
      try {
        hint = localStorage.getItem(LOGIN_HINT_KEY) ?? ''
      } catch {}
      if (hint) {
        setEmail(hint)
        setRemember(true)
      }
      emailRef.current?.focus()
    })
  }, [])

  async function submitLogin(e?: React.FormEvent) {
    e?.preventDefault()
    if (!email || !password) return
    setBusy(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error === 'invalid' ? t('auth.invalidCreds') : t('common.error'))
        return
      }
      try {
        if (remember) localStorage.setItem(LOGIN_HINT_KEY, email.trim())
        else localStorage.removeItem(LOGIN_HINT_KEY)
      } catch {}
      setSession(json.data.user as SessionUser, json.data.org as OrgDTO)
      toast.success(t('auth.loginTitle'))
    } catch {
      toast.error(t('boot.failed'))
    } finally {
      setBusy(false)
    }
  }

  async function submitRegister(e?: React.FormEvent) {
    e?.preventDefault()
    if (!orgName || !name || !rEmail || !rPassword) return
    if (rPassword.length < 6) {
      toast.error(t('set.weakPassword'))
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orgName, name, email: rEmail, password: rPassword }),
      })
      const json = await res.json()
      if (!res.ok) {
        switch (json.error) {
          case 'email-taken':
            toast.error(t('auth.emailTaken'))
            break
          case 'weak-password':
            toast.error(t('set.weakPassword'))
            break
          case 'invalid-email':
            toast.error(t('set.invalidEmail'))
            break
          default:
            toast.error(t('common.error'))
        }
        return
      }
      setSession(json.data.user as SessionUser, json.data.org as OrgDTO)
    } catch {
      toast.error(t('boot.failed'))
    } finally {
      setBusy(false)
    }
  }

  function fillDemo() {
    setEmail(DEMO.email)
    setPassword(DEMO.password)
  }

  function demoCopy(e: React.SyntheticEvent, value: string) {
    e.stopPropagation()
    e.preventDefault()
    void copyText(value).then((okFlag) =>
      okFlag ? toast.success(t('common.copySuccess')) : toast.error(t('common.error'))
    )
  }

  const eyeBtn =
    'absolute end-1 top-1/2 -translate-y-1/2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden lg:flex flex-col justify-between p-10 bg-primary text-primary-foreground overflow-hidden">
        <div className="absolute inset-0 opacity-15 pointer-events-none select-none" aria-hidden>
          <Boxes className="absolute -top-10 -start-10 size-[420px]" strokeWidth={0.5} />
          <Package className="absolute bottom-16 end-4 size-72 rotate-12" strokeWidth={0.6} />
        </div>
        <div className="relative">
          <p className="text-3xl font-extrabold tracking-tight">H.A.M.D</p>
          <p className="mt-1 text-sm opacity-90">{t('app.tagline')}</p>
        </div>
        <ul className="relative space-y-5 text-lg font-medium">
          {[
            { icon: Package, text: t('auth.feature.inv') },
            { icon: Zap, text: t('auth.feature.pos') },
            { icon: BarChart3, text: t('auth.feature.rpt') },
            { icon: WifiOff, text: t('auth.feature.off') },
          ].map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-white/15">
                <Icon className="size-5" aria-hidden />
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <p className="relative text-xs opacity-75">© {new Date().getFullYear()} H.A.M.D</p>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center p-4 sm:p-8 bg-background" id="main-content">
        <Card className="w-full max-w-md border-none shadow-none sm:shadow-sm py-0">
          <CardContent className="relative p-6 sm:p-8">
            <div className="mb-6 flex flex-col gap-1.5 lg:hidden">
              <p className="text-2xl font-extrabold text-primary">H.A.M.D</p>
              <p className="text-sm text-muted-foreground">{t('app.tagline')}</p>
            </div>

            {/* brand splash while creating the workspace */}
            {busy && mode === 'register' ? (
              <div
                role="status"
                aria-live="polite"
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/85 backdrop-blur-sm"
              >
                <span className="relative flex size-16 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/25" aria-hidden />
                  <span className="relative flex size-12 items-center justify-center rounded-2xl bg-primary font-extrabold text-xl text-primary-foreground shadow-sm select-none">
                    H
                  </span>
                </span>
                <p className="text-sm font-medium">{t('set.registeringSplash')}</p>
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
              </div>
            ) : null}

            <Tabs value={mode} onValueChange={(v) => setMode(v as 'login' | 'register')}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">{t('auth.login')}</TabsTrigger>
                <TabsTrigger value="register">{t('auth.register')}</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <h1 className="text-xl font-bold">{t('auth.loginTitle')}</h1>
                <p className="text-sm text-muted-foreground mb-5">{t('auth.loginSubtitle')}</p>
                <form onSubmit={submitLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">{t('auth.email')}</Label>
                    <Input
                      id="email"
                      ref={emailRef}
                      dir="ltr"
                      autoComplete="email"
                      inputMode="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@tijara.app"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">{t('auth.password')}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        dir="ltr"
                        type={showPw ? 'text' : 'password'}
                        autoComplete="current-password"
                        className="pe-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                      />
                      <button
                        type="button"
                        className={eyeBtn}
                        onClick={() => setShowPw((v) => !v)}
                        aria-label={showPw ? t('set.hidePassword') : t('set.showPassword')}
                        title={showPw ? t('set.hidePassword') : t('set.showPassword')}
                      >
                        {showPw ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                      </button>
                    </div>
                  </div>

                  {/* sibling label (not wrapping) — avoids Radix Checkbox double-toggle inside <label> */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <Checkbox id="remember-me" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                    <Label htmlFor="remember-me" className="cursor-pointer select-none text-sm font-normal">
                      {t('set.rememberMe')}
                    </Label>
                  </div>

                  <Button type="submit" disabled={busy} className="w-full h-11 text-base">
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                    {busy ? t('auth.loggingIn') : t('auth.login')}
                  </Button>
                </form>

                {/* Demo account — whole tile clickable + per-field copy */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={fillDemo}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    if (e.target !== e.currentTarget) return
                    e.preventDefault()
                    fillDemo()
                  }}
                  className="mt-4 w-full rounded-lg border border-dashed border-emerald-300 dark:border-emerald-800 px-3 py-2.5 text-start hover:bg-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="font-semibold">{t('auth.demoTitle')}</span>
                  <span
                    dir="ltr"
                    className="num-ltr mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground"
                  >
                    <span className="truncate">{DEMO.email}</span>
                    <CopyChipButton value={DEMO.email} label={t('set.copyEmail')} onCopy={demoCopy} />
                  </span>
                  <span
                    dir="ltr"
                    className="num-ltr flex items-center justify-between gap-2 text-xs text-muted-foreground"
                  >
                    <span>{DEMO.password}</span>
                    <CopyChipButton value={DEMO.password} label={t('set.copyPassword')} onCopy={demoCopy} />
                  </span>
                  <span className="mt-1 inline-block text-xs text-primary underline underline-offset-2">
                    {t('auth.demoFill')}
                  </span>
                </div>

                <button
                  onClick={() => setMode('register')}
                  className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors block mx-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                >
                  {t('auth.switchToRegister')}
                </button>
              </TabsContent>

              <TabsContent value="register">
                <h1 className="text-xl font-bold">{t('auth.registerTitle')}</h1>
                <p className="text-sm text-muted-foreground mb-5">{t('auth.registerSubtitle')}</p>
                <form onSubmit={submitRegister} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="orgName">{t('auth.orgName')}</Label>
                    <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="سوبر ماركت النور" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="name">{t('auth.yourName')}</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="محمد أحمد" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="remail">{t('auth.email')}</Label>
                    <Input
                      id="remail"
                      dir="ltr"
                      inputMode="email"
                      autoComplete="off"
                      className="num-ltr text-start"
                      value={rEmail}
                      onChange={(e) => setREmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rpass">{t('auth.password')}</Label>
                    <div className="relative">
                      <Input
                        id="rpass"
                        dir="ltr"
                        type={showRPw ? 'text' : 'password'}
                        minLength={6}
                        autoComplete="new-password"
                        className="pe-10 num-ltr text-start"
                        value={rPassword}
                        onChange={(e) => setRPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                      />
                      <button
                        type="button"
                        className={eyeBtn}
                        onClick={() => setShowRPw((v) => !v)}
                        aria-label={showRPw ? t('set.hidePassword') : t('set.showPassword')}
                        title={showRPw ? t('set.hidePassword') : t('set.showPassword')}
                      >
                        {showRPw ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" disabled={busy} className="w-full h-11 text-base">
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                    {busy ? t('common.saving') : t('auth.register')}
                  </Button>
                </form>
                <button
                  onClick={() => setMode('login')}
                  className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors block mx-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                >
                  {t('auth.switchToLogin')}
                </button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

/** Tiny copy affordance used inside the demo credentials tile. */
function CopyChipButton({
  value,
  label,
  onCopy,
}: {
  value: string
  label: string
  onCopy: (e: React.MouseEvent<HTMLButtonElement>, value: string) => void
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => onCopy(e, value)}
      aria-label={label}
      title={label}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Copy className="size-3" aria-hidden />
    </button>
  )
}
