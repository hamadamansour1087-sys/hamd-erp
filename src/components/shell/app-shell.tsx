'use client'

import * as React from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { LogOut, Menu, Moon, PanelLeftClose, Sun } from 'lucide-react'
import { toast } from 'sonner'

import { useI18n } from '@/lib/i18n'
import { canAccess, useUIStore, type ViewKey } from '@/stores/ui'
import { useSession } from '@/stores/session'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { NAV_SECTIONS, VIEW_TITLE_KEYS } from '@/components/shell/nav-config'
import { useOnlineStatus } from '@/components/shell/use-online-status'

function LogoMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-extrabold text-lg shadow-sm select-none',
        className
      )}
      aria-hidden
    >
      ت
    </div>
  )
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)
  const role = useSession((s) => s.user?.role ?? 'ADMIN')
  const { t } = useI18n()

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-5 px-3 py-4 flex-1 overflow-y-auto scrollbar-thin">
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter((i) => canAccess(role, i.key as ViewKey))
        if (items.length === 0) return null
        return (
          <div key={section.labelKey}>
            <p className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {t(section.labelKey)}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active = view === item.key
                return (
                  <li key={item.key}>
                    <button
                      onClick={() => {
                        setView(item.key)
                        onNavigate?.()
                      }}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <item.icon className="size-4.5 shrink-0" aria-hidden />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

function SidebarInner() {
  const orgName = useSession((s) => s.org?.name)
  const collapsed = useUIStore((s) => s.collapsed)
  return (
    <>
      <div className={cn('flex h-16 shrink-0 items-center border-b px-4 gap-2.5', collapsed && 'justify-center px-2')}>
        <LogoMark />
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-extrabold leading-none">H.A.M.D</p>
            <p className="text-xs text-muted-foreground mt-1 truncate max-w-[160px]">{orgName}</p>
          </div>
        )}
      </div>
      <NavList />
    </>
  )
}

function DesktopSidebar() {
  const collapsed = useUIStore((s) => s.collapsed)
  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'hidden md:flex sticky top-0 z-40 h-screen shrink-0 flex-col border-e bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-60'
      )}
    >
      <SidebarInner />
    </aside>
  )
}

function MobileSidebar() {
  const open = useUIStore((s) => s.sidebarOpen)
  const setOpen = useUIStore((s) => s.setSidebarOpen)
  const { t } = useI18n()
  const { dir } = useI18n()
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('shell.collapseSidebar')}>
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side={dir === 'rtl' ? 'right' : 'left'} className="w-72 p-0 bg-sidebar">
        <SheetTitle className="sr-only">{t('app.name')}</SheetTitle>
        <SidebarInner />
      </SheetContent>
    </Sheet>
  )
}

function LangToggle() {
  const lang = useI18n().lang
  const setLang = useI18n().setLang
  const { t } = useI18n()
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
      title={t('shell.langSwitch')}
      className="gap-1.5 font-semibold"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
      <span>{t('shell.langSwitch')}</span>
    </Button>
  )
}

function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const { t } = useI18n()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? t('shell.theme.light') : t('shell.theme.dark')}
      aria-label={isDark ? t('shell.theme.light') : t('shell.theme.dark')}
    >
      {mounted && isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  )
}

const ACCENTS = ['emerald', 'teal', 'amber', 'rose', 'violet']
const ACCENT_DOT: Record<string, string> = {
  emerald: 'bg-emerald-600',
  teal: 'bg-teal-600',
  amber: 'bg-amber-500',
  rose: 'bg-rose-600',
  violet: 'bg-violet-600',
}

function UserMenu() {
  const user = useSession((s) => s.user)
  const logout = useSession((s) => s.logout)
  const accent = useUIStore((s) => s.accent)
  const setAccent = useUIStore((s) => s.setAccent)
  const { t } = useI18n()

  if (!user) return null
  const initials = user.name.trim().slice(0, 2).toUpperCase()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label={user.name}>
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-semibold truncate">{user.name}</p>
          <p className="text-xs text-muted-foreground truncate num-ltr" dir="ltr">
            {user.email}
          </p>
          <Badge variant="secondary" className="mt-1.5 pointer-events-none">
            {t(`role.${user.role}`)}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t('shell.accent')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {ACCENTS.map((a) => (
              <DropdownMenuItem key={a} onClick={() => setAccent(a)} className="gap-2">
                <span className={cn('size-4 rounded-full ring-1 ring-border inline-block', ACCENT_DOT[a])} aria-hidden />
                <span>{t(`accent.${a}`)}</span>
                {accent === a && <span className="ms-auto text-primary">✓</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={async () => {
            await logout()
            toast.success(t('auth.loggedOut'))
          }}
        >
          <LogOut className="size-4" /> {t('shell.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Topbar() {
  const view = useUIStore((s) => s.view)
  const collapsed = useUIStore((s) => s.collapsed)
  const toggleCollapsed = useUIStore((s) => s.toggleCollapsed)
  const online = useOnlineStatus()
  const { t } = useI18n()
  const title = t(VIEW_TITLE_KEYS[view])

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 px-3 md:px-6">
      <MobileSidebar />
      <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={toggleCollapsed} title={t('shell.collapseSidebar')} aria-label={t('shell.collapseSidebar')}>
        <PanelLeftClose className={cn('size-5 transition-transform', collapsed && 'rotate-180 rtl:-rotate-180')} />
      </Button>
      <h2 className="truncate font-semibold text-base md:text-lg">{title}</h2>
      <div className="ms-auto flex items-center gap-1 md:gap-1.5">
        <span
          className={cn('me-1 hidden sm:flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', online ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300' : 'border-red-300 text-red-700 dark:border-red-900 dark:text-red-400')}
          title={online ? t('shell.online') : t('shell.offline')}
        >
          <span className={cn('size-2 rounded-full', online ? 'bg-emerald-500 animate-pulse' : 'bg-red-500')} aria-hidden />
          {online ? t('shell.online') : t('shell.offline')}
        </span>
        <LangToggle />
        <ModeToggle />
        <UserMenu />
      </div>
    </header>
  )
}

export function AppFooter() {
  const orgName = useSession((s) => s.org?.name)
  const { t, date } = useI18n()
  return (
    <footer className="mt-auto border-t bg-muted/40 px-4 md:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          © {date(new Date())} · {orgName || 'H.A.M.D'} — {t('footer.rights')}
        </p>
        <p className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
            {t('footer.worksOffline')}
          </span>
          <span aria-hidden>·</span>
          <span>{t('footer.version')}</span>
        </p>
      </div>
    </footer>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main-content" className="flex-1 px-3 py-4 md:px-6 md:py-6 w-full max-w-screen-2xl mx-auto">
          {children}
        </main>
        <AppFooter />
      </div>
    </div>
  )
}

export { LogoMark, NavList }
