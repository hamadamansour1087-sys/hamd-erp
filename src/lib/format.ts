let cachedLang: 'ar' | 'en' | null = null

export function currentLang(): 'ar' | 'en' {
  if (cachedLang) return cachedLang
  if (typeof document !== 'undefined') {
    cachedLang = (document.documentElement.lang as 'ar' | 'en') === 'en' ? 'en' : 'ar'
  }
  return cachedLang ?? 'ar'
}

const AR_EG = 'ar-EG'

export function formatMoney(amount: number, currencyCode?: string, lang?: 'ar' | 'en'): string {
  const l = lang ?? currentLang()
  const cur = currencyCode ?? 'EGP'
  const n = Number.isFinite(amount) ? amount : 0
  try {
    return new Intl.NumberFormat(l === 'ar' ? AR_EG : 'en-US', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 2,
      minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n)
  } catch {
    return `${n.toFixed(2)} ${cur}`
  }
}

export function formatNum(n: number, digits = 2, lang?: 'ar' | 'en'): string {
  const l = lang ?? currentLang()
  return new Intl.NumberFormat(l === 'ar' ? AR_EG : 'en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0)
}

export function formatDate(d: string | Date, withTime = false, lang?: 'ar' | 'en'): string {
  const l = lang ?? currentLang()
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return '-'
  return new Intl.DateTimeFormat(l === 'ar' ? AR_EG : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(dt)
}

export const CURRENCIES = [
  { code: 'EGP', labelAr: 'جنيه مصري', labelEn: 'Egyptian Pound' },
  { code: 'SAR', labelAr: 'ريال سعودي', labelEn: 'Saudi Riyal' },
  { code: 'AED', labelAr: 'درهم إماراتي', labelEn: 'UAE Dirham' },
  { code: 'USD', labelAr: 'دولار أمريكي', labelEn: 'US Dollar' },
  { code: 'EUR', labelAr: 'يورو', labelEn: 'Euro' },
  { code: 'KWD', labelAr: 'دينار كويتي', labelEn: 'Kuwaiti Dinar' },
  { code: 'QAR', labelAr: 'ريال قطري', labelEn: 'Qatari Riyal' },
  { code: 'JOD', labelAr: 'دينار أردني', labelEn: 'Jordanian Dinar' },
]

export function round2Client(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
