'use client'

/**
 * chart-parts.tsx — private helpers for Task 5-a only (Dashboard + Reports views).
 * Chart color palette (literal hex — recharts cannot read CSS vars):
 *   sales/positive → emerald #10b981 · purchases → amber #f59e0b
 *   profit overlay  → violet #8b5cf6 · negatives/expenses → rose #f43f5e
 */

import { cn } from '@/lib/utils'

/**
 * Compact money for axis ticks / tight chips: 12,400 → "١٢٫٤ ألف" style via
 * Intl compact notation in the given locale. Currency symbol intentionally
 * omitted to save space.
 */
export function makeCompact(locale: 'ar' | 'en') {
  const fmt = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
  return (n: number) => fmt.format(Number.isFinite(n) ? n : 0)
}

/** yyyy-mm-dd stamp used in exported filenames. */
export function YMD(d = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

export const CHART_COLORS = {
  sales: '#10b981',
  purchase: '#f59e0b',
  profit: '#8b5cf6',
  negative: '#f43f5e',
  teal: '#14b8a6',
  zinc: '#71717a',
} as const

/** Donut/pie cell palette (stable order). */
export const PIE_PALETTE = [
  CHART_COLORS.sales,
  CHART_COLORS.profit,
  CHART_COLORS.purchase,
  CHART_COLORS.teal,
  CHART_COLORS.negative,
  CHART_COLORS.zinc,
] as const

export interface BalancesDTO {
  customers: Array<{ id: string; name: string; phone: string | null; owed: number }>
  suppliers: Array<{ id: string; name: string; phone: string | null; owed: number }>
  totals: { receivables: number; payables: number }
}

interface TipRow {
  dataKey?: string | number
  name?: string
  value?: number
  color?: string
}

interface TipProps {
  active?: boolean
  payload?: TipRow[]
  label?: string | number
}

/**
 * Custom recharts tooltip rendered RTL-friendly:
 * label on top, one colored-dot row per series with full formatted money.
 */
export function MoneyTip({
  active,
  payload,
  label,
  rows,
  fmt,
}: {
  rows: Array<{ key: string; name: string; dotColor: string }>
  fmt: (n: number) => string
} & TipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div dir="rtl" className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md min-w-36">
      <p className="font-semibold text-foreground mb-1">{String(label ?? '')}</p>
      {rows.map((r) => {
        const row = payload.find((p) => p.dataKey === r.key)
        if (!row || typeof row.value !== 'number') return null
        return (
          <div key={r.key} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: r.dotColor }} aria-hidden />
            <span className="text-muted-foreground">{r.name}</span>
            <span className="num-ltr font-semibold ms-auto">{fmt(row.value)}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Manual legend chips under charts (color dot + localized label). */
export function LegendChips({
  items,
  className,
}: {
  items: Array<{ color: string; label: string; dashed?: boolean }>
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-1', className)}>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="h-0 w-4 rounded-full"
            style={{ borderTop: it.dashed ? `2px dashed ${it.color}` : `3px solid ${it.color}` }}
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}

/** Percentage coverage bar used in low-stock tables/lists (RTL-safe logical layout). */
export function CoverageBar({ pct, className }: { pct: number; className?: string }) {
  const clamped = Math.max(2, Math.min(100, Math.round(pct)))
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      role="img"
      aria-label={`${clamped}%`}
    >
      <div
        className={cn('h-full rounded-full', pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500')}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

/** Trigger a client-side file download from a Blob. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** RFC-quoted CSV export with UTF-8 BOM so Excel opens Arabic correctly. */
export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')
  downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), filename)
}

export interface ReportPrintTable {
  title: string
  headers: string[]
  rows: Array<Array<string | number>>
  /** Highlight rows whose first cell starts with this marker (e.g. totals). */
  emphasisFirstRow?: boolean
}

/**
 * Open the browser print dialog with a clean RTL report document
 * (user can then «Save as PDF»). Returns false when popups are blocked.
 * Letterhead includes the company logo + phone/address when provided.
 */
export function printReport(opts: {
  title: string
  subtitle: string
  brand: string
  logo?: string | null
  phone?: string | null
  address?: string | null
  dir?: 'rtl' | 'ltr'
  rangeLabel?: string
  kpis?: Array<{ label: string; value: string }>
  tables: ReportPrintTable[]
}): boolean {
  const esc = (v: string | number) =>
    String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

  const kpiHtml = opts.kpis?.length
    ? `<div class="kpis">${opts.kpis
        .map((k) => `<div class="kpi"><span>${esc(k.label)}</span><b>${esc(k.value)}</b></div>`)
        .join('')}</div>`
    : ''

  const tablesHtml = opts.tables
    .map(
      (tb) => `
      <section class="tbl">
        <h2>${esc(tb.title)}</h2>
        <table>
          <thead><tr>${tb.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>
            ${
              tb.rows.length === 0
                ? `<tr><td colspan="${tb.headers.length}" class="empty">—</td></tr>`
                : tb.rows
                    .map((r, ri) =>
                      tb.emphasisFirstRow && ri === 0
                        ? `<tr class="strong">${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`
                        : `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`
                    )
                    .join('')
            }
          </tbody>
        </table>
      </section>`
    )
    .join('')

  const dir = opts.dir ?? 'rtl'
  const contact = [opts.phone, opts.address].filter(Boolean).join(' · ')
  const logoHtml = opts.logo
    ? `<img class="logo" src="${esc(opts.logo)}" alt="" />`
    : `<div class="mark">H</div>`
  const html = `<!doctype html>
<html dir="${dir}" lang="${dir === 'rtl' ? 'ar' : 'en'}"><head><meta charset="utf-8">
<title>${esc(opts.title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Cairo','Segoe UI',Tahoma,sans-serif;margin:24px;color:#0f172a}
  header{display:flex;align-items:center;gap:12px;border-bottom:3px solid #10b981;padding-bottom:12px;margin-bottom:16px}
  .mark{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;flex-shrink:0}
  .logo{width:52px;height:52px;border-radius:12px;object-fit:contain;background:#fff;flex-shrink:0}
  h1{font-size:20px;margin:0}
  .sub{font-size:12px;color:#64748b;margin-top:2px}
  .contact{font-size:11px;color:#059669;margin-top:2px;font-weight:600}
  .range{margin-inline-start:auto;font-size:12px;background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;padding:4px 10px;border-radius:999px;white-space:nowrap}
  .kpis{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}
  .kpi{flex:1 1 160px;border:1px solid #e2e8f0;border-radius:12px;padding:10px 14px;background:#f8fafc}
  .kpi span{display:block;font-size:11px;color:#64748b}
  .kpi b{font-size:16px}
  .tbl{margin-bottom:22px;break-inside:avoid}
  h2{font-size:14px;margin:0 0 8px;color:#065f46}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#ecfdf5;color:#064e3b;text-align:start;padding:7px 10px;border:1px solid #d1fae5}
  td{padding:6px 10px;border:1px solid #e2e8f0}
  tr:nth-child(even) td{background:#f8fafc}
  tr.strong td{background:#ecfdf5;font-weight:700}
  td.empty{text-align:center;color:#94a3b8}
  footer{margin-top:26px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px}
  @media print{body{margin:10mm} .tbl{break-inside:avoid}}
</style></head>
<body>
  <header>
    ${logoHtml}
    <div><h1>${esc(opts.brand)} — ${esc(opts.title)}</h1><div class="sub">${esc(opts.subtitle)}</div>${contact ? `<div class="contact">${esc(contact)}</div>` : ''}</div>
    ${opts.rangeLabel ? `<div class="range">${esc(opts.rangeLabel)}</div>` : ''}
  </header>
  ${kpiHtml}
  ${tablesHtml}
  <footer>${esc(opts.brand)} · ${esc(new Date().toLocaleString(dir === 'rtl' ? 'ar-EG' : 'en-GB'))}</footer>
  <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body></html>`

  const w = window.open('', '_blank', 'width=920,height=720')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}
