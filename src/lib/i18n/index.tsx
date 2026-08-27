// i18n engine — owned by ORCHESTRATOR. Aggregates root dict + all module dicts.
'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { rootDict } from './root-dict'
import { authDict } from './modules/auth'
import { catalogDict } from './modules/catalog'
import { dashboardDict } from './modules/dashboard'
import { designerDict } from './modules/designer'
import { financeDict } from './modules/finance'
import { peopleDict } from './modules/people'
import { posDict } from './modules/pos'
import { purchasesDict } from './modules/purchases'
import { reportsDict } from './modules/reports'
import { salesDict } from './modules/sales'
import { settingsDict } from './modules/settings'
import { stockDict } from './modules/stock'

export type Lang = 'ar' | 'en'

const ALL: { en: Record<string, string>; ar: Record<string, string> }[] = [
  rootDict,
  authDict,
  catalogDict,
  dashboardDict,
  designerDict,
  financeDict,
  peopleDict,
  posDict,
  purchasesDict,
  reportsDict,
  salesDict,
  settingsDict,
  stockDict,
]

const MERGED = {
  en: Object.assign({}, ...ALL.map((d) => d.en)),
  ar: Object.assign({}, ...ALL.map((d) => d.ar)),
}

interface I18nContextValue {
  lang: Lang
  dir: 'rtl' | 'ltr'
  t: (key: string, params?: Record<string, string | number>) => string
  setLang: (l: Lang) => void
  money: (n: number) => string
  num: (n: number, digits?: number) => string
  date: (d: string | Date, withTime?: boolean) => string
  currency: string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function detectLang(): Lang {
  if (typeof document === 'undefined') return 'ar'
  return document.documentElement.lang === 'en' ? 'en' : 'ar'
}

export function LanguageProvider({
  children,
  currency = 'EGP',
}: {
  children: React.ReactNode
  currency?: string
}) {
  const [lang, setLangState] = useState<Lang>('ar')

  useEffect(() => {
    // defer sync state update out of the effect body (react-hooks/set-state-in-effect)
    void Promise.resolve().then(() => setLangState(detectLang()))
  }, [])

  const applyLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem('tijara-lang', l)
    } catch {}
    const html = document.documentElement
    html.lang = l
    html.dir = l === 'ar' ? 'rtl' : 'ltr'
  }, [])

  const setLang = useCallback(
    (l: Lang) => applyLang(l),
    [applyLang]
  )

  // Keep currency in sync whenever org changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem('tijara-currency')
      if (stored && stored !== currency) localStorage.setItem('tijara-currency', currency)
      else if (!stored) localStorage.setItem('tijara-currency', currency)
    } catch {}
  }, [currency])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let s: string = MERGED[lang][key] ?? MERGED.en[key] ?? key
      if (params) {
        for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
      }
      return s
    },
    [lang]
  )

  const value = useMemo<I18nContextValue>(() => {
    const moneyFmt = (n: number) => {
      try {
        return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
          style: 'currency',
          currency,
          maximumFractionDigits: 2,
        }).format(Number.isFinite(n) ? n : 0)
      } catch {
        return `${(Number.isFinite(n) ? n : 0).toFixed(2)} ${currency}`
      }
    }
    const numFmt = (n: number, digits = 2) =>
      new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
        maximumFractionDigits: digits,
        minimumFractionDigits: 0,
      }).format(Number.isFinite(n) ? n : 0)
    const dateFmt = (d: string | Date, withTime = false) => {
      const dt = typeof d === 'string' ? new Date(d) : d
      if (isNaN(dt.getTime())) return '-'
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      }).format(dt)
    }
    return {
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      t,
      setLang,
      money: moneyFmt,
      num: numFmt,
      date: dateFmt,
      currency,
    }
  }, [lang, t, setLang, currency])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <LanguageProvider>')
  return ctx
}
