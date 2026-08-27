import ExcelJS from 'exceljs'
import { db } from '@/lib/db'
import { round2 } from '@/lib/api-helpers'
import { lowStockProducts, stockValuation, partyDues } from '@/lib/reports-utils'
import { startOfToday } from '@/lib/server-time'

/**
 * excel-report.ts — styled Excel (.xlsx) report generator (server-side, ExcelJS).
 * Every sheet gets a company letterhead: logo + org name + phone/address line,
 * report title, range and generation stamp. Arabic version = full RTL sheets
 * (rightToLeft view), zebra rows, brand-colored headers and real numeric cells.
 */

export type ReportKind = 'overview' | 'products' | 'stock' | 'balances'
export type ExcelLang = 'ar' | 'en'

// Brand palette (matches the app: emerald primary)
const BRAND = {
  dark: 'FF065F46', // header text green-800
  fill: 'FF10B981', // table header fill emerald-500
  soft: 'FFECFDF5', // totals / KPI label fill emerald-50
  zebra: 'FFF8FAFC', // even row fill slate-50
  border: 'FFCBD5E1', // slate-300
  muted: 'FF64748B', // slate-500
}

const MONEY_FMT = '#,##0.00'
const QTY_FMT = '#,##0'
const PCT_FMT = '0%'

export interface ExcelTable {
  headers: string[]
  widths: number[]
  /** per-column type drives number format + alignment */
  types: Array<'text' | 'money' | 'qty' | 'pct'>
  rows: Array<Array<string | number>>
  /** bold, soft-filled row appended after data (e.g. totals) */
  totalsRow?: Array<string | number>
}

export interface ExcelKpi {
  label: string
  value: string | number
  kind?: 'money' | 'qty' | 'text'
}

// ─────────────────────────── data assembly ───────────────────────────

export interface ReportPayload {
  org: { name: string; phone: string | null; address: string | null; logo: string | null; currencyCode: string }
  lang: ExcelLang
  kind: ReportKind
  days: number
  rangeLabel: string
  generatedLabel: string
  kpis: ExcelKpi[]
  main: { sheetName: string; table: ExcelTable }
  extraSheets: Array<{ sheetName: string; table: ExcelTable }>
}

function fmtDayLabel(d: Date, lang: ExcelLang): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    timeZone: 'Africa/Cairo',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

function fmtStamp(d: Date, lang: ExcelLang): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(d)
}

function pctOf(part: number, total: number): number {
  return total > 0 ? part / total : 0
}

async function collect(orgId: string, kind: ReportKind, days: number, lang: ExcelLang): Promise<ReportPayload> {
  const org = await db.org.findUnique({
    where: { id: orgId },
    select: { name: true, phone: true, address: true, logo: true, currencyCode: true },
  })
  if (!org) throw new Error('ORG_NOT_FOUND')

  const t = (ar: string, en: string) => (lang === 'ar' ? ar : en)
  const rangeLabel = t(`آخر ${days} يوم`, `Last ${days} days`)
  const generatedLabel = `${t('تم الإنشاء', 'Generated')}: ${fmtStamp(new Date(), lang)}`

  if (kind === 'balances') {
    const dues = await partyDues(orgId)
    const customers = dues.customerRows.filter((c) => Math.abs(c.owed) > 0.009).sort((a, b) => b.owed - a.owed)
    const suppliers = dues.supplierRows.filter((c) => Math.abs(c.owed) > 0.009).sort((a, b) => b.owed - a.owed)
    const partyTable = (rows: typeof customers): ExcelTable => ({
      headers: [t('الاسم', 'Name'), t('الهاتف', 'Phone'), t('الرصيد المستحق', 'Balance owed')],
      widths: [36, 20, 18],
      types: ['text', 'text', 'money'],
      rows: rows.map((r) => [r.name, r.phone ?? '—', round2(Math.abs(r.owed))]),
      totalsRow: [t('الإجمالي', 'Total'), '', round2(rows.reduce((s, r) => s + Math.max(0, Math.abs(r.owed)), 0))],
    })
    return {
      org, lang, kind, days, rangeLabel, generatedLabel,
      kpis: [
        { label: t('إجمالي المديونيات (عملاء)', 'Total receivables'), value: dues.receivables, kind: 'money' },
        { label: t('إجمالي مستحقات الموردين', 'Total payables'), value: dues.payables, kind: 'money' },
      ],
      main: { sheetName: t('أرصدة العملاء', 'Customers balances'), table: partyTable(customers) },
      extraSheets: [{ sheetName: t('أرصدة الموردين', 'Suppliers balances'), table: partyTable(suppliers) }],
    }
  }

  // overview / products / stock share the charts dataset
  const dayStart = startOfToday()
  const from = new Date(dayStart.getTime() - (days - 1) * 86_400_000)
  const to = new Date(dayStart.getTime() + 86_399_000)
  const [salesInv, purInv, expenses, valuation, lows] = await Promise.all([
    db.invoice.findMany({
      where: { orgId, type: 'SALE', status: { not: 'CANCELLED' }, date: { gte: from, lte: to } },
      select: { date: true, total: true, taxAmount: true, costTotal: true },
    }),
    db.invoice.findMany({
      where: { orgId, type: 'PURCHASE', status: { not: 'CANCELLED' }, date: { gte: from, lte: to } },
      select: { date: true, total: true },
    }),
    db.expense.findMany({ where: { orgId, date: { gte: from, lte: to } }, select: { date: true, amount: true } }),
    stockValuation(orgId),
    lowStockProducts(orgId),
  ])

  const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' })
  const buckets = new Map<string, { label: string; sales: number; profit: number; purchases: number; exp: number; count: number }>()
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * 86_400_000)
    buckets.set(keyFmt.format(d), { label: fmtDayLabel(d, lang), sales: 0, profit: 0, purchases: 0, exp: 0, count: 0 })
  }
  for (const inv of salesInv) {
    const b = buckets.get(keyFmt.format(new Date(inv.date)))
    if (!b) continue
    b.sales += inv.total
    b.profit += inv.total - inv.taxAmount - inv.costTotal
    b.count++
  }
  for (const inv of purInv) {
    const b = buckets.get(keyFmt.format(new Date(inv.date)))
    if (b) b.purchases += inv.total
  }
  for (const ex of expenses) {
    const b = buckets.get(keyFmt.format(new Date(ex.date)))
    if (b) b.exp += ex.amount
  }

  const sorted = Array.from(buckets.keys()).sort()
  const daily = sorted.map((k) => buckets.get(k)!)
  const salesTotal = round2(daily.reduce((s, b) => s + b.sales, 0))
  const profitTotal = round2(daily.reduce((s, b) => s + b.profit, 0))
  const expTotal = round2(daily.reduce((s, b) => s + b.exp, 0))
  const purchTotal = round2(daily.reduce((s, b) => s + b.purchases, 0))

  // shared builders for product/category tables (used by 'overview' and 'products')
  const buildProductTables = async (limit: number) => {
    const [topItems, allCats, rangeItems] = await Promise.all([
      db.invoiceItem.groupBy({
        by: ['productId'],
        where: { invoice: { orgId, type: 'SALE', status: { not: 'CANCELLED' }, date: { gte: from, lte: to } } },
        _sum: { total: true, qty: true },
        orderBy: { _sum: { total: 'desc' } },
        take: limit,
      }),
      db.category.findMany({ where: { orgId }, select: { id: true, name: true } }),
      db.invoiceItem.findMany({
        where: { invoice: { orgId, type: 'SALE', status: { not: 'CANCELLED' }, date: { gte: from, lte: to } } },
        select: { productId: true, total: true },
      }),
    ])
    const prodIds = topItems.map((x) => x.productId)
    const prods = prodIds.length
      ? await db.product.findMany({ where: { orgId, id: { in: prodIds } }, select: { id: true, name: true, categoryId: true } })
      : []
    const pmap = new Map(prods.map((p) => [p.id, p]))
    const catMap = new Map(allCats.map((c) => [c.id, c.name]))
    const productsTable: ExcelTable = {
      headers: ['#', t('المنتج', 'Product'), t('الكمية المباعة', 'Qty sold'), t('الإيراد', 'Revenue'), t('الحصة', 'Share')],
      widths: [6, 36, 14, 16, 10],
      types: ['qty', 'text', 'qty', 'money', 'pct'],
      rows: topItems.map((x, i) => {
        const rev = round2(x._sum.total ?? 0)
        return [i + 1, pmap.get(x.productId)?.name ?? '-', x._sum.qty ?? 0, rev, pctOf(rev, salesTotal)]
      }),
    }
    const catTotals = new Map<string, number>()
    for (const it of rangeItems) {
      const p = prods.find((x) => x.id === it.productId)
      const key = p?.categoryId ?? '__none__'
      catTotals.set(key, (catTotals.get(key) ?? 0) + it.total)
    }
    const categoriesTable: ExcelTable = {
      headers: [t('التصنيف', 'Category'), t('الإيراد', 'Revenue'), t('الحصة', 'Share')],
      widths: [32, 18, 12],
      types: ['text', 'money', 'pct'],
      rows: Array.from(catTotals.entries())
        .map(([id, v]) => ({ name: id === '__none__' ? t('غير مصنف', 'Uncategorized') : catMap.get(id) ?? t('غير مصنف', 'Uncategorized'), value: round2(v) }))
        .filter((c) => c.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((c) => [c.name, c.value, pctOf(c.value, salesTotal)]),
    }
    return { productsTable, categoriesTable }
  }

  if (kind === 'overview') {
    const dailyTable: ExcelTable = {
      headers: [t('اليوم', 'Day'), t('المبيعات', 'Sales'), t('الربح', 'Profit'), t('المشتريات', 'Purchases'), t('المصروفات', 'Expenses'), t('الفواتير', 'Invoices')],
      widths: [18, 15, 15, 15, 15, 11],
      types: ['text', 'money', 'money', 'money', 'money', 'qty'],
      rows: daily.map((b) => [b.label, round2(b.sales), round2(b.profit), round2(b.purchases), round2(b.exp), b.count]),
      totalsRow: [t('الإجمالي', 'Total'), salesTotal, profitTotal, purchTotal, expTotal, daily.reduce((s, b) => s + b.count, 0)],
    }

    const [tables, custAgg] = await Promise.all([
      buildProductTables(15),
      db.invoice.groupBy({
        by: ['customerId'],
        where: { orgId, type: 'SALE', status: { not: 'CANCELLED' }, customerId: { not: null }, date: { gte: from, lte: to } },
        _sum: { total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 10,
      }),
    ])
    const custIds = custAgg.map((c) => c.customerId).filter((x): x is string => x !== null)
    const custs = custIds.length ? await db.customer.findMany({ where: { orgId, id: { in: custIds } }, select: { id: true, name: true } }) : []
    const cmap = new Map(custs.map((c) => [c.id, c.name]))
    const customersTable: ExcelTable = {
      headers: ['#', t('العميل', 'Customer'), t('الإيراد', 'Revenue'), t('الحصة', 'Share')],
      widths: [6, 36, 16, 10],
      types: ['qty', 'text', 'money', 'pct'],
      rows: custAgg.map((c, i) => {
        const v = round2(c._sum.total ?? 0)
        return [i + 1, (c.customerId && cmap.get(c.customerId)) || t('عميل نقدي', 'Walk-in customer'), v, pctOf(v, salesTotal)]
      }),
    }

    return {
      org, lang, kind, days, rangeLabel, generatedLabel,
      kpis: [
        { label: t('إجمالي المبيعات', 'Total sales'), value: salesTotal, kind: 'money' },
        { label: t('إجمالي الربح', 'Gross profit'), value: profitTotal, kind: 'money' },
        { label: t('المصروفات', 'Expenses'), value: expTotal, kind: 'money' },
        { label: t('صافي الربح بعد المصروفات', 'Net profit (after expenses)'), value: round2(profitTotal - expTotal), kind: 'money' },
      ],
      main: { sheetName: t('الملخص اليومي', 'Daily summary'), table: dailyTable },
      extraSheets: [
        { sheetName: t('أفضل المنتجات', 'Top products'), table: tables.productsTable },
        { sheetName: t('التصنيفات', 'Categories'), table: tables.categoriesTable },
        { sheetName: t('أفضل العملاء', 'Top customers'), table: customersTable },
      ],
    }
  }

  if (kind === 'products') {
    const tables = await buildProductTables(25)
    return {
      org, lang, kind, days, rangeLabel, generatedLabel,
      kpis: [{ label: t('إجمالي المبيعات', 'Total sales'), value: salesTotal, kind: 'money' }],
      main: { sheetName: t('أفضل المنتجات', 'Top products'), table: tables.productsTable },
      extraSheets: [{ sheetName: t('التصنيفات', 'Categories'), table: tables.categoriesTable }],
    }
  }

  // stock
  const lowsTable: ExcelTable = {
    headers: [t('المنتج', 'Product'), t('الباركود', 'Barcode'), t('المتاح', 'Available'), t('الحد الأدنى', 'Min'), t('الحالة', 'Status'), t('المخازن', 'Warehouses')],
    widths: [30, 18, 11, 11, 10, 32],
    types: ['text', 'text', 'qty', 'qty', 'pct', 'text'],
    rows: lows.map((l) => [
      l.name,
      l.barcode ?? '—',
      l.qty,
      l.minQty,
      l.minQty > 0 ? Math.min(1, l.qty / l.minQty) : 1,
      l.warehouseNames || '—',
    ]),
  }
  return {
    org, lang, kind, days, rangeLabel, generatedLabel,
    kpis: [
      { label: t('قيمة المخزون (تكلفة)', 'Stock value (cost)'), value: valuation, kind: 'money' },
      { label: t('عدد الأصناف الناقصة', 'Low-stock items'), value: lows.length, kind: 'qty' },
    ],
    main: { sheetName: t('أصناف على وشك النفاذ', 'Low stock items'), table: lowsTable },
    extraSheets: [],
  }
}

// ─────────────────────────── logo ───────────────────────────

async function resolveLogoImage(logo: string | null): Promise<{ buffer: Buffer; extension: 'png' | 'jpeg' } | null> {
  if (!logo) return null
  // SSRF hardening: only inline data URLs are ever processed. The server must not
  // fetch remote URLs — even ones stored by staff — so remote logos are skipped.
  if (!logo.startsWith('data:')) return null
  try {
    if (logo.startsWith('data:')) {
      const m = /^data:image\/(png|jpe?g|svg\+xml);base64,(.+)$/.exec(logo)
      if (!m) return null
      if (m[1] === 'svg+xml') {
        const sharp = (await import('sharp')).default
        const buf = await sharp(Buffer.from(m[2], 'base64')).resize(256, 256, { fit: 'inside' }).png().toBuffer()
        return { buffer: buf, extension: 'png' }
      }
      return { buffer: Buffer.from(m[2], 'base64'), extension: m[1] === 'png' ? 'png' : 'jpeg' }
    }
    return null
  } catch {
    return null
  }
}

// ─────────────────────────── workbook builder ───────────────────────────

const HEADER_ROWS = 4 // rows consumed by the compact letterhead block (+1 spacer)

const BORDER_THIN = { style: 'thin' as const, color: { argb: BRAND.border } }

function styleRange(ws: ExcelJS.Worksheet, from: string, to: string, style: Partial<ExcelJS.Style>) {
  // apply style to every cell in a (possibly merged) rectangular range so
  // borders/fills render around merged masters too
  const r1 = Number(from.replace(/\D/g, ''))
  const r2 = Number(to.replace(/\D/g, ''))
  const c1 = from.charCodeAt(0) - 64
  const c2 = to.charCodeAt(0) - 64
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      Object.assign(ws.getCell(r, c), style)
    }
  }
}

function renderTable(ws: ExcelJS.Worksheet, table: ExcelTable, startRow: number): number {
  const rtl = ws.views[0]?.rightToLeft === true
  let r = startRow

  const headerRow = ws.getRow(r)
  table.headers.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h
  })
  headerRow.height = 22
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' }, name: 'Cairo' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.fill } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { top: BORDER_THIN, bottom: { style: 'medium', color: { argb: 'FF047857' } }, left: BORDER_THIN, right: BORDER_THIN }
  })
  r += 1

  table.rows.forEach((row, ri) => {
    const xRow = ws.getRow(r)
    xRow.height = 18
    row.forEach((val, ci) => {
      const cell = xRow.getCell(ci + 1)
      cell.value = val as ExcelJS.CellValue
      const type = table.types[ci] ?? 'text'
      const numFmt = type === 'money' ? MONEY_FMT : type === 'qty' ? QTY_FMT : type === 'pct' ? PCT_FMT : undefined
      if (numFmt) cell.numFmt = numFmt
      cell.alignment = { vertical: 'middle', horizontal: type === 'text' ? (rtl ? 'right' : 'left') : 'center' }
      cell.border = { top: { style: 'hair', color: { argb: BRAND.border } }, bottom: { style: 'hair', color: { argb: BRAND.border } }, left: BORDER_THIN, right: BORDER_THIN }
      if (ri % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } }
      cell.font = { size: 10.5, name: 'Cairo' }
    })
    r += 1
  })

  if (table.totalsRow) {
    const xRow = ws.getRow(r)
    xRow.height = 20
    table.totalsRow.forEach((val, ci) => {
      const cell = xRow.getCell(ci + 1)
      cell.value = val as ExcelJS.CellValue
      const type = table.types[ci] ?? 'text'
      const numFmt = type === 'money' ? MONEY_FMT : type === 'qty' ? QTY_FMT : type === 'pct' ? PCT_FMT : undefined
      if (numFmt) cell.numFmt = numFmt
      cell.font = { bold: true, size: 11, color: { argb: BRAND.dark }, name: 'Cairo' }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.soft } }
      cell.alignment = { vertical: 'middle', horizontal: type === 'text' ? (rtl ? 'right' : 'left') : 'center' }
      cell.border = { top: { style: 'double', color: { argb: 'FF047857' } }, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN }
    })
    r += 1
  }
  return r
}

function renderKpis(ws: ExcelJS.Worksheet, kpis: ExcelKpi[], startRow: number, cols: number): number {
  const half = cols >= 5 ? Math.ceil(cols / 2) : 2
  const colLetter = (c: number) => String.fromCharCode(64 + c)
  let r = startRow
  for (const k of kpis) {
    const lEnd = colLetter(half)
    const vStart = colLetter(half + 1)
    const vEnd = colLetter(Math.max(half + 1, cols))
    ws.mergeCells(`A${r}:${lEnd}${r}`)
    if (vEnd > vStart) ws.mergeCells(`${vStart}${r}:${vEnd}${r}`)
    const label = ws.getCell(`A${r}`)
    label.value = k.label
    label.font = { bold: true, size: 10.5, color: { argb: BRAND.dark }, name: 'Cairo' }
    label.alignment = { vertical: 'middle', horizontal: 'right' }
    const value = ws.getCell(`${vStart}${r}`)
    value.value = k.value
    if (k.kind === 'money') value.numFmt = MONEY_FMT
    if (k.kind === 'qty') value.numFmt = QTY_FMT
    value.font = { bold: true, size: 11, name: 'Cairo' }
    value.alignment = { vertical: 'middle', horizontal: 'center' }
    const base = { font: label.font, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.soft } }, border: { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN } } as Partial<ExcelJS.Style>
    styleRange(ws, `A${r}`, lEnd + String(r), base)
    styleRange(ws, `${vStart}${r}`, `${vEnd}${r}`, { fill: base.fill, border: base.border })
    ws.getRow(r).height = 20
    r += 1
  }
  return r
}

interface HeaderOpts {
  org: ReportPayload['org']
  title: string
  rangeLabel: string
  generatedLabel: string
  lang: ExcelLang
  imageId?: number
  full: boolean
}

function renderHeader(ws: ExcelJS.Worksheet, o: HeaderOpts): number {
  const rtl = o.lang === 'ar'
  ws.views = [{ rightToLeft: rtl, showGridLines: false }]
  ws.properties.tabColor = { argb: BRAND.fill }
  const align = rtl ? 'right' : 'left'

  if (o.full) {
    // logo occupies A1:B3 (top-right in RTL sheets, top-left in LTR)
    if (o.imageId !== undefined) {
      ws.mergeCells('A1:B3')
      ws.addImage(o.imageId, { tl: { col: 0.2, row: 0.2 }, ext: { width: 58, height: 58 }, editAs: 'oneCell' })
    }
    ws.mergeCells('C1:F1')
    ws.mergeCells('C2:F2')
    ws.mergeCells('C3:F3')
    const name = ws.getCell('C1')
    name.value = o.org.name
    name.font = { bold: true, size: 16, color: { argb: BRAND.dark }, name: 'Cairo' }
    name.alignment = { vertical: 'middle', horizontal: align }
    const contact = ws.getCell('C2')
    contact.value = [o.org.phone, o.org.address].filter(Boolean).join(' · ') || null
    contact.font = { size: 10, color: { argb: BRAND.muted }, name: 'Cairo' }
    contact.alignment = { vertical: 'middle', horizontal: align }
    const meta = ws.getCell('C3')
    meta.value = `${o.rangeLabel} · ${o.generatedLabel}`
    meta.font = { size: 9.5, color: { argb: BRAND.muted }, name: 'Cairo' }
    meta.alignment = { vertical: 'middle', horizontal: align }
    ws.getRow(1).height = 24
    ws.getRow(2).height = 18
    ws.getRow(3).height = 18
    ws.getRow(4).height = 8
    return 5
  }

  ws.mergeCells('A1:F1')
  ws.mergeCells('A2:F2')
  const name = ws.getCell('A1')
  name.value = `${o.org.name} — ${o.title}`
  name.font = { bold: true, size: 13, color: { argb: BRAND.dark }, name: 'Cairo' }
  name.alignment = { vertical: 'middle', horizontal: align }
  const meta = ws.getCell('A2')
  meta.value = `${o.rangeLabel} · ${o.generatedLabel}`
  meta.font = { size: 9.5, color: { argb: BRAND.muted }, name: 'Cairo' }
  meta.alignment = { vertical: 'middle', horizontal: align }
  ws.getRow(1).height = 20
  ws.getRow(2).height = 16
  ws.getRow(3).height = 8
  return HEADER_ROWS
}

async function buildWorkbook(p: ReportPayload): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = p.org.name
  wb.lastModifiedBy = p.org.name
  wb.created = new Date()

  const image = await resolveLogoImage(p.org.logo)
  const imageId = image ? wb.addImage({ buffer: image.buffer as unknown as ExcelJS.Buffer, extension: image.extension }) : undefined

  // ---- main sheet ----
  const ws = wb.addWorksheet(p.main.sheetName)
  const afterHeader = renderHeader(ws, {
    org: p.org, title: p.main.sheetName, rangeLabel: p.rangeLabel, generatedLabel: p.generatedLabel, lang: p.lang, imageId, full: true,
  })
  ws.columns = p.main.table.widths.map((w) => ({ width: w }))
  let r = afterHeader
  if (p.kpis.length > 0) r = renderKpis(ws, p.kpis, r, p.main.table.headers.length) + 1
  renderTable(ws, p.main.table, r)

  // ---- secondary sheets ----
  for (const s of p.extraSheets) {
    const sheet = wb.addWorksheet(s.sheetName)
    renderHeader(sheet, {
      org: p.org, title: s.sheetName, rangeLabel: p.rangeLabel, generatedLabel: p.generatedLabel, lang: p.lang, full: false,
    })
    sheet.columns = s.table.widths.map((w) => ({ width: w }))
    renderTable(sheet, s.table, HEADER_ROWS)
  }

  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out)
}

export async function generateReportWorkbook(opts: { orgId: string; kind: ReportKind; days: number; lang: ExcelLang }): Promise<{ buffer: Buffer; filename: string }> {
  const p = await collect(opts.orgId, opts.kind, opts.days, opts.lang)
  const buffer = await buildWorkbook(p)
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const range = opts.kind === 'balances' ? 'all' : `${opts.days}d`
  return { buffer, filename: `hamd-${opts.kind}-${range}-${stamp}.xlsx` }
}
