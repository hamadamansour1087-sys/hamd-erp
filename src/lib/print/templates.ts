/**
 * Print document templates — pure HTML builders.
 * Owned by Task 5-b (PrintDesignAgent).
 *
 * NO react / DOM imports — every function here is a pure string-in/string-out
 * builder so it is trivially testable and shared by:
 *   - `src/lib/print/client.ts` (real printing via hidden iframe)
 *   - `src/views/designer/DesignerView.tsx` (live preview iframe)
 *
 * Printed output is always LTR-numbers ("printer-safe"): money uses latin
 * digits + currency code suffix, dates are formatted en-GB style.
 */
import type { InvoiceTemplateData } from '@/lib/types'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PrintOrgInfo {
  name: string
  phone?: string | null
  address?: string | null
  currencyCode: string
}

export interface PrintInvoiceItem {
  nameSnap: string
  unitSnap?: string | null
  barcodeSnap?: string | null
  qty: number
  price: number
  total?: number
}

/** Mirrors GET /api/invoices/[id] detail shape (fields used for printing). */
export interface PrintInvoiceDoc {
  kind: 'invoice'
  number: number
  type: 'SALE' | 'PURCHASE'
  status?: string
  date: string
  partyName?: string | null
  warehouseName?: string | null
  createdBy?: string | null
  subtotal?: number
  discount?: number
  taxPercent?: number
  taxAmount?: number
  total: number
  paidAmount?: number
  notes?: string | null
  items: PrintInvoiceItem[]
}

/** Mirrors a GET /api/vouchers row for printDoc('receipt'|'payment'). */
export interface PrintVoucherDoc {
  kind: 'receipt' | 'payment'
  number: number
  method?: string
  amount: number
  partyName?: string | null
  invoiceNumber?: number | null
  note?: string | null
  date: string
}

export type PrintableDoc = PrintInvoiceDoc | PrintVoucherDoc

/** Additive extension of the orchestrator-owned InvoiceTemplateData.a4 block. */
export type A4Template = InvoiceTemplateData['a4'] & {
  /** Optional data-URL logo (compressed to ≤120px height by the designer). */
  logoDataUrl?: string | null
}

export interface DesignerTemplate extends InvoiceTemplateData {
  a4: A4Template
}

// ---------------------------------------------------------------------------
// DEFAULT TEMPLATE (must satisfy InvoiceTemplateData exactly)
// ---------------------------------------------------------------------------

export const A4_TITLE_AR = 'فاتورة ضريبية مبسطة'
export const A4_TITLE_EN = 'Simplified Tax Invoice'
export const HEADER_NOTE_AR = 'شكراً لتعاملكم معنا ونتشرف بخدمتكم دائماً'
export const HEADER_NOTE_EN = 'Thank you for your business — we look forward to serving you again'
export const THERMAL_FOOTER_AR = 'شكراً لزيارتكم نتشرف بخدمتكم دائماً'
export const THERMAL_FOOTER_EN = 'Thank you for visiting — we are always happy to serve you'

export const DEFAULT_TEMPLATE: DesignerTemplate = {
  a4: {
    showLogo: true,
    title: A4_TITLE_AR,
    headerNote: HEADER_NOTE_AR,
    accent: '#0f766e',
    fontFamily: 'cairo',
    fontSize: 12,
    columns: { barcode: true, unit: true, itemPrice: true, itemTotal: true },
    showTaxRow: true,
    showDiscountRow: true,
    watermark: false,
    signatureLines: true,
    showBarcodeFooter: true,
  },
  thermal: {
    defaultWidth: '80mm',
    showLogoText: true,
    showQr: true,
    footerMsg: THERMAL_FOOTER_AR,
    cutLine: true,
  },
}

/**
 * Deep-merge any stored/partial template JSON over the defaults so the result
 * always satisfies DesignerTemplate (and therefore InvoiceTemplateData).
 * `null` / `undefined` branches keep the defaults; arrays & scalars replace.
 */
export function mergeTemplate(partial?: Partial<DesignerTemplate> | null): DesignerTemplate {
  const base = structuredCloneSafe(DEFAULT_TEMPLATE) as unknown as Record<string, unknown>
  if (partial && typeof partial === 'object') {
    deepMerge(base, partial as unknown as Record<string, unknown>)
  }
  return base as unknown as DesignerTemplate
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function deepMerge(base: Record<string, unknown>, over: Partial<Record<string, unknown>>): Record<string, unknown> {
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined || v === null) continue
    const b = base[k]
    if (
      typeof v === 'object' && !Array.isArray(v) &&
      typeof b === 'object' && b !== null && !Array.isArray(b)
    ) {
      deepMerge(b as Record<string, unknown>, v as Partial<Record<string, unknown>>)
    } else {
      base[k] = typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v
    }
  }
  return base
}

// ---------------------------------------------------------------------------
// Mini bilingual dictionary — ONLY what the printed sheet itself needs
// ---------------------------------------------------------------------------

export type Lang = 'ar' | 'en'

const MINI: Record<Lang, Record<string, string>> = {
  ar: {
    invoiceNo: 'رقم الفاتورة',
    docNo: 'رقم المستند',
    date: 'التاريخ',
    customer: 'العميل',
    supplier: 'المورد',
    walkIn: 'عميل نقدي',
    warehouse: 'المستودع',
    item: 'البند',
    qty: 'الكمية',
    price: 'السعر',
    unit: 'الوحدة',
    total: 'الإجمالي',
    subtotal: 'الإجمالي الفرعي',
    discount: 'الخصم',
    tax: 'الضريبة',
    paid: 'المدفوع',
    remaining: 'المتبقي',
    change: 'الباقي',
    grandTotal: 'الإجمالي النهائي',
    amount: 'المبلغ',
    method: 'طريقة الدفع',
    CASH: 'نقداً',
    BANK: 'تحويل بنكي',
    CARD: 'بطاقة',
    WALLET: 'محفظة إلكترونية',
    receipt: 'سند قبض',
    payment: 'سند صرف',
    notes: 'ملاحظات',
    linkedInvoice: 'فاتورة مرتبطة',
    signatureSeller: 'توقيع البائع',
    signatureBuyer: 'توقيع المشتري',
    purchaseTitle: 'فاتورة مشتريات',
    phoneLabel: 'هاتف',
    qrNote: 'امسح للتحقق',
  },
  en: {
    invoiceNo: 'Invoice #',
    docNo: 'Document #',
    date: 'Date',
    customer: 'Customer',
    supplier: 'Supplier',
    walkIn: 'Walk-in customer',
    warehouse: 'Warehouse',
    item: 'Item',
    qty: 'Qty',
    price: 'Price',
    unit: 'Unit',
    total: 'Total',
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'Tax',
    paid: 'Paid',
    remaining: 'Remaining',
    change: 'Change',
    grandTotal: 'GRAND TOTAL',
    amount: 'Amount',
    method: 'Payment method',
    CASH: 'Cash',
    BANK: 'Bank transfer',
    CARD: 'Card',
    WALLET: 'Wallet',
    receipt: 'Receipt voucher',
    payment: 'Payment voucher',
    notes: 'Notes',
    linkedInvoice: 'Linked invoice',
    signatureSeller: 'Seller signature',
    signatureBuyer: 'Buyer signature',
    purchaseTitle: 'Purchase Invoice',
    phoneLabel: 'Phone',
    qrNote: 'Scan to verify',
  },
}

/** Translate with the tiny in-doc dictionary (falls back to key). */
export function tr(lang: Lang, key: string): string {
  return MINI[lang][key] ?? MINI.en[key] ?? key
}

/**
 * Template titles resolve bilingual without storing two strings:
 * when lang is EN and the stored value is still the Arabic default, use the
 * English default; otherwise respect whatever the merchant customized.
 */
export function resolveTitle(tpl: DesignerTemplate, lang: Lang): string {
  if (!tpl.a4.title) return lang === 'en' ? A4_TITLE_EN : A4_TITLE_AR
  if (lang === 'en' && tpl.a4.title === A4_TITLE_AR) return A4_TITLE_EN
  return tpl.a4.title
}

export function resolveHeaderNote(tpl: DesignerTemplate, lang: Lang): string {
  if (!tpl.a4.headerNote) return lang === 'en' ? HEADER_NOTE_EN : HEADER_NOTE_AR
  if (lang === 'en' && tpl.a4.headerNote === HEADER_NOTE_AR) return HEADER_NOTE_EN
  return tpl.a4.headerNote
}

export function resolveThermalFooter(tpl: DesignerTemplate, lang: Lang): string {
  if (!tpl.thermal.footerMsg) return lang === 'en' ? THERMAL_FOOTER_EN : THERMAL_FOOTER_AR
  if (lang === 'en' && tpl.thermal.footerMsg === THERMAL_FOOTER_AR) return THERMAL_FOOTER_EN
  return tpl.thermal.footerMsg
}

// ---------------------------------------------------------------------------
// Formatting helpers (printer-safe: ALWAYS latin digits)
// ---------------------------------------------------------------------------

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function safeAccent(accent?: string | null): string {
  return accent && HEX_RE.test(accent) ? accent : '#0f766e'
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Money with latin digits + currency code suffix: `1,234.50 EGP`. */
export function fmtMoney(n: number | undefined | null, currencyCode: string): string {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0
  try {
    return `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyCode}`
  } catch {
    return `${v.toFixed(2)} ${currencyCode}`
  }
}

/** Qty with up to 3 decimals trimmed: 2 / 0.5 / 1.25. */
export function fmtQty(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  return v % 1 === 0 ? String(v) : String(Math.round(v * 1000) / 1000)
}

/** yyyy/mm/dd hh:mm — latin digits regardless of document language. */
export function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** INV-000123 / PUR-000123 / VCH-0042 — always LTR printable reference. */
export function docRef(doc: PrintableDoc): string {
  if (doc.kind === 'invoice') {
    const prefix = doc.type === 'PURCHASE' ? 'PUR' : 'INV'
    return `${prefix}-${String(doc.number ?? 0).padStart(6, '0')}`
  }
  return `VCH-${String(doc.number ?? 0).padStart(4, '0')}`
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ---------------------------------------------------------------------------
// Shared shell + micro CSS helpers
// ---------------------------------------------------------------------------

const CAIRO_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap">'

interface ShellArgs {
  lang: Lang
  title: string
  bodyCss: string
  css: string
  content: string
  cairoFont: boolean
}

function docShell({ lang, title, bodyCss, css, content, cairoFont }: ShellArgs): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  return [
    '<!DOCTYPE html>',
    `<html lang="${lang}" dir="${dir}"><head><meta charset="utf-8">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    cairoFont ? CAIRO_LINK : '',
    '<style>',
    '*{box-sizing:border-box;margin:0;padding:0}',
    'html,body{background:#fff;color:#111}',
    bodyCss,
    css,
    '@media print{.no-print{display:none!important}}',
    '</style></head><body>',
    content,
    '</body></html>',
  ].join('\n')
}

/** Dotted-leader row used across thermal sheets: LABEL ............ VALUE. */
function dotRow(label: string, value: string, opts?: { strong?: boolean }): string {
  return (
    `<div class="trow${opts?.strong ? ' strong' : ''}">` +
    `<span class="tl">${escapeHtml(label)}</span>` +
    '<span class="dots"></span>' +
    `<span class="tv num-ltr">${value}</span>` +
    '</div>'
  )
}

function barcodeLine(refNum: string): string {
  return `<div class="bc num-ltr" dir="ltr">===== ${escapeHtml(refNum)} =====</div>`
}

/**
 * Documented limitation instead of shipping an embedded QR encoder:
 * renders a framed placeholder square labelled "QR" with the document ref
 * beneath it (see `dsg.qrNote`). ESC/POS-aware printer drivers substitute it
 * on supported emulations.
 */
function qrPlaceholder(refNum: string, label: string): string {
  return (
    '<div class="qr-wrap">' +
    '<div class="qr-box num-ltr" dir="ltr">QR</div>' +
    `<div class="qr-ref num-ltr" dir="ltr">${escapeHtml(refNum)}</div>` +
    `<div class="qr-note">${escapeHtml(label)}</div>` +
    '</div>'
  )
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export interface BuildArgs {
  org: PrintOrgInfo
  doc: PrintableDoc
  tpl: DesignerTemplate
  paper: 'A4' | '58mm' | '80mm'
  copies?: number
  /** Document language; defaults to the module-level language (setPrintLanguage). */
  lang?: Lang
}

/** Master entry — routes by paper mode. Pure apart from the lang fallback. */
export function buildDocHtml(args: BuildArgs): string {
  const { org, doc, tpl, paper, copies } = args
  const html = paper === 'A4' ? buildA4(org, doc, tpl, resolveLangArg(args)) : buildThermal({ ...args })
  return wrapCopies(html, copies ?? 1)
}

function resolveLangArg(args: BuildArgs): Lang {
  return args.lang ?? currentPrintLang()
}

function wrapCopies(inner: string, copies: number): string {
  // inner is a full <html> doc; duplicate its <body> payload
  const openTag = '<body>'
  const start = inner.indexOf(openTag)
  const end = inner.lastIndexOf('</body>')
  if (start === -1 || end === -1) return inner
  const head = inner.slice(0, start + openTag.length)
  const tail = inner.slice(end)
  const bodyContent = inner.slice(start + openTag.length, end)
  const n = Math.max(1, Math.min(10, Math.floor(copies || 1)))
  if (n === 1) return inner
  const dup = Array.from({ length: n }, () => `<section class="copy">${bodyContent}</section>`).join('\n')
  return `${head}\n${dup}\n${tail}`.replace(
    '@media print{.no-print{display:none!important}}',
    '@media print{.no-print{display:none!important}.copy+.copy{page-break-before:always}}'
  )
}

function buildA4(org: PrintOrgInfo, doc: PrintableDoc, tpl: DesignerTemplate, lang: Lang): string {
  const accent = safeAccent(tpl.a4.accent)
  const tint = `${accent}1a`
  const basePt = Math.max(8, Math.min(16, tpl.a4.fontSize || 12))
  const fontStack =
    tpl.a4.fontFamily === 'cairo'
      ? "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif"
      : "'Segoe UI', system-ui, Tahoma, Arial, sans-serif"

  const isInvoice = doc.kind === 'invoice'
  const inv = isInvoice ? (doc as PrintInvoiceDoc) : null
  const voc = !isInvoice ? (doc as PrintVoucherDoc) : null

  const partyKey = inv ? (inv.type === 'PURCHASE' ? tr(lang, 'supplier') : tr(lang, 'customer')) : tr(lang, 'customer')
  const title = isInvoice
    ? inv!.type === 'PURCHASE'
      ? tr(lang, 'purchaseTitle')
      : resolveTitle(tpl, lang)
    : tr(lang, doc.kind)

  // ---- header ------------------------------------------------------------
  const logoOrInitial = tpl.a4.showLogo
    ? tpl.a4.logoDataUrl
      ? `<img class="logo" src="${escapeHtml(tpl.a4.logoDataUrl)}" alt="" />`
      : `<div class="logo-init">${escapeHtml(Array.from((org.name || 'T').trim())[0] ?? 'T')}</div>`
    : ''

  const contactBits: string[] = []
  if (org.phone) contactBits.push(`<span dir="ltr" class="num-ltr">${escapeHtml(org.phone)}</span>`)
  if (org.address) contactBits.push(escapeHtml(org.address))

  const headerStart = `
    <div class="h-org">
      ${logoOrInitial}
      <div>
        <div class="org-name">${escapeHtml(org.name)}</div>
        ${contactBits.length ? `<div class="org-contact num-ltr-safe">${contactBits.join('<br/>')}</div>` : ''}
      </div>
    </div>`

  const metaRows: Array<[string, string]> = [
    [isInvoice ? tr(lang, 'invoiceNo') : tr(lang, 'docNo'), `<b>${escapeHtml(docRef(doc))}</b>`],
    [tr(lang, 'date'), fmtDate(doc.date)],
  ]
  if (doc.partyName) metaRows.push([partyKey, escapeHtml(doc.partyName)])
  if (isInvoice && inv!.warehouseName) metaRows.push([tr(lang, 'warehouse'), escapeHtml(inv!.warehouseName)])
  if (voc?.invoiceNumber != null)
    metaRows.push([tr(lang, 'linkedInvoice'), `VCH<span class="muted">→</span>INV-${String(voc.invoiceNumber).padStart(6, '0')}`])
  if (voc?.method) metaRows.push([tr(lang, 'method'), tr(lang, voc.method)])

  const headerEnd = `
    <table class="meta">
      ${metaRows.map(([k, v]) => `<tr><td class="mk">${k}</td><td class="mv">${v}</td></tr>`).join('')}
    </table>`

  // ---- items table (invoices only) ---------------------------------------
  let itemsSection = ''
  if (inv) {
    const cols = tpl.a4.columns
    const hasUnitCol = cols.unit && inv.items.some((i) => !!i.unitSnap)
    const headCells = [
      `<th class="c-name">${tr(lang, 'item')}</th>`,
      cols.barcode ? '' : '', // barcode renders as subline inside name cell
      hasUnitCol ? `<th class="c-unit">${tr(lang, 'unit')}</th>` : '',
      `<th class="c-qty">${tr(lang, 'qty')}</th>`,
      cols.itemPrice ? `<th class="c-price">${tr(lang, 'price')}</th>` : '',
      cols.itemTotal ? `<th class="c-total">${tr(lang, 'total')}</th>` : '',
    ].join('')

    const rows = inv.items
      .map((it) => {
        const lineTotal = it.total ?? round2(it.qty * it.price)
        const nameCell =
          escapeHtml(it.nameSnap) +
          (cols.barcode && it.barcodeSnap
            ? `<div class="it-bc num-ltr" dir="ltr">${escapeHtml(it.barcodeSnap)}</div>`
            : '')
        return [
          '<tr>',
          `<td class="c-name">${nameCell}</td>`,
          hasUnitCol ? `<td class="c-unit">${escapeHtml(it.unitSnap ?? '')}</td>` : '',
          `<td class="c-qty"><span class="num-ltr" dir="ltr">${fmtQty(it.qty)}</span></td>`,
          cols.itemPrice ? `<td class="c-price"><span class="num-ltr" dir="ltr">${fmtMoney(it.price, org.currencyCode)}</span></td>` : '',
          cols.itemTotal ? `<td class="c-total"><span class="num-ltr" dir="ltr">${fmtMoney(lineTotal, org.currencyCode)}</span></td>` : '',
          '</tr>',
        ].join('')
      })
      .join('')

    itemsSection = `
      <table class="items">
        <thead><tr>${headCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`
  }

  // ---- totals --------------------------------------------------------------
  let totalsSection = ''
  if (inv) {
    const trows: string[] = []
    if (tpl.a4.showDiscountRow && (inv.discount ?? 0) > 0)
      trows.push(totRow(tr(lang, 'discount'), fmtMoney(inv!.discount, org.currencyCode)))
    if (tpl.a4.showTaxRow && (inv.taxPercent ?? 0) > 0)
      trows.push(totRow(`${tr(lang, 'tax')} (<span class="num-ltr" dir="ltr">${fmtQty(inv!.taxPercent ?? 0)}%</span>)`, fmtMoney(inv!.taxAmount, org.currencyCode)))
    if ((inv.subtotal ?? 0) > 0 && (trows.length > 0))
      trows.unshift(totRow(tr(lang, 'subtotal'), fmtMoney(inv!.subtotal, org.currencyCode)))

    const paid = inv.paidAmount ?? 0
    const remaining = round2(inv.total - paid)

    totalsSection = `
      <div class="totwrap">
        <table class="totals">
          ${trows.join('')}
          <tr class="grand"><td>${tr(lang, 'grandTotal')}</td><td><span class="num-ltr" dir="ltr">${fmtMoney(inv.total, org.currencyCode)}</span></td></tr>
          ${paid > 0 ? totRow(tr(lang, 'paid'), fmtMoney(paid, org.currencyCode)) : ''}
          ${remaining > 0.009 ? totRow(tr(lang, 'remaining'), fmtMoney(remaining, org.currencyCode), true) : ''}
        </table>
      </div>`
  } else if (voc) {
    totalsSection = `
      <div class="totwrap">
        <table class="totals">
          <tr class="grand"><td>${tr(lang, 'amount')}</td><td><span class="num-ltr" dir="ltr">${fmtMoney(voc.amount, org.currencyCode)}</span></td></tr>
          ${voc.method ? totRow(tr(lang, 'method'), tr(lang, voc.method)) : ''}
        </table>
      </div>`
  }

  // ---- extra blocks ----------------------------------------------------------
  const notesHtml = (() => {
    const noteTxt = inv?.notes ?? voc?.note ?? ''
    if (!noteTxt) return ''
    return `<div class="notes"><b>${tr(lang, 'notes')}:</b> ${escapeHtml(noteTxt)}</div>`
  })()

  const watermarkHtml = tpl.a4.watermark
    ? `<div class="wm" aria-hidden="true">${escapeHtml(org.name)}</div>`
    : ''

  const signaturesHtml = tpl.a4.signatureLines
    ? `
      <div class="sigs">
        <div class="sig"><div class="sig-line"></div><div>${tr(lang, 'signatureSeller')}</div></div>
        <div class="sig"><div class="sig-line"></div><div>${tr(lang, 'signatureBuyer')}</div></div>
      </div>`
    : ''

  const bcFooter = tpl.a4.showBarcodeFooter ? barcodeLine(docRef(doc)) : ''
  const headerNote = tpl.a4.headerNote
    ? `<div class="hdr-note">${escapeHtml(resolveHeaderNote(tpl, lang))}</div>`
    : ''

  const titleOverride = isInvoice && inv!.type === 'PURCHASE' ? tr(lang, 'purchaseTitle') : title

  const content = `
    <div class="sheet">
      ${watermarkHtml}
      <div class="hdr">
        ${headerStart}
        ${headerEnd}
      </div>
      <hr class="rule" />
      <div class="doc-title">${escapeHtml(titleOverride)}</div>
      ${headerNote}
      ${itemsSection}
      ${totalsSection}
      ${notesHtml}
      ${signaturesHtml}
      ${bcFooter}
    </div>`

  const bodyCss = `
    body{width:210mm;padding:12mm;font-family:${fontStack};font-size:${basePt}pt;line-height:1.55}`

  const css = `
    .sheet{position:relative;min-height:250mm}
    .wm{position:absolute;inset-inline:0;top:38%;text-align:center;font-size:64pt;font-weight:800;
        color:${accent};opacity:.06;transform:rotate(-26deg);z-index:-1;white-space:nowrap}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm}
    .h-org{display:flex;gap:4mm;align-items:center;min-width:0}
    .logo{max-height:22mm;max-width:40mm;object-fit:contain}
    .logo-init{width:14mm;height:14mm;border-radius:50%;background:${accent};color:#fff;
        display:flex;align-items:center;justify-content:center;font-size:18pt;font-weight:800}
    .org-name{font-size:1.45em;font-weight:800;color:${accent}}
    .org-contact{color:#444;font-size:.78em;margin-top:1px;line-height:1.6}
    .meta{border-collapse:collapse;font-size:.92em;min-width:62mm}
    .meta td{padding:1.2mm 2mm;border-bottom:.35pt solid #bbb;vertical-align:top}
    .meta .mk{color:#555;white-space:nowrap}
    .meta .mv{text-align:end;font-weight:600}
    .rule{border:0;border-top:2.2px solid ${accent};margin:4mm 0 3mm}
    .doc-title{text-align:center;font-size:1.5em;font-weight:800;color:${accent};letter-spacing:.2px}
    .hdr-note{text-align:center;color:#666;font-size:.85em;margin-top:1.5mm;font-style:italic}
    table.items{width:100%;border-collapse:collapse;margin-top:5mm;font-size:.95em}
    .items th{background:${tint};color:#123;text-align:start;padding:2mm 2.5mm;border-bottom:1.6px solid ${accent};
        font-weight:700;white-space:nowrap}
    .items td{padding:1.9mm 2.5mm;border-bottom:.35pt solid #ddd;vertical-align:top}
    .items tbody tr:nth-child(even){background:#fafafa}
    .c-unit,.c-qty,.c-price,.c-total{text-align:center;white-space:nowrap}
    th.c-total,th.c-price{text-align:center}
    .it-bc{font-size:.72em;color:#777;font-family:'Courier New',monospace;direction:ltr}
    .num-ltr,.mv .num-ltr{unicode-bidi:embed}
    .bdo-ltr{direction:ltr;unicode-bidi:bidi-override}
    .totwrap{display:flex;justify-content:flex-end;margin-top:5mm}
    table.totals{min-width:82mm;border-collapse:collapse}
    table.totals td{padding:1.4mm 2.5mm;border-bottom:.35pt dotted #999;font-size:.95em}
    table.totals td:first-child{color:#555}
    table.totals td:last-child{text-align:end}
    tr.grand td{border:1.6px solid ${accent};background:${tint};font-size:1.12em;font-weight:800;padding:2.6mm;border-bottom-width:1.6px!important}
    tr.grand td:first-child{border-start-end-radius:0;border-end-end-radius:0;color:${accent}}
    td.neg{color:#b91c1c;font-weight:700}
    .notes{margin-top:5mm;font-size:.88em;color:#333;background:#f8f8f8;border-inline-start:3px solid ${accent};
        padding:2mm 3mm;border-radius:2mm;white-space:pre-line}
    .sigs{display:flex;justify-content:space-between;margin-top:16mm;padding-inline:8mm}
    .sig{text-align:center;font-size:.85em;color:#555;width:55mm}
    .sig-line{border-top:1.1px dashed #777;margin-bottom:1.6mm}
    .bc{text-align:center;margin-top:9mm;font-family:'Courier New',monospace;font-weight:700;
        font-size:1.05em;letter-spacing:1px;color:#111}
    @page{size:A4 portrait;margin:0}
    @media print{-webkit-print-color-adjust:exact;print-color-adjust:exact}`

  return docShell({
    lang,
    title: titleOverride,
    bodyCss,
    css,
    content,
    cairoFont: tpl.a4.fontFamily === 'cairo',
  })
}

function totRow(label: string, value: string, neg = false): string {
  return `<tr><td>${label}</td><td class="${neg ? 'neg ' : ''}num-ltr" dir="ltr">${value}</td></tr>`
}

function escapeHtmlKeepLtr(s: string): string {
  return escapeHtml(s)
}
void escapeHtmlKeepLtr

// ===========================================================================
// Thermal builders (58mm ≈48–50mm content · 80mm ≈72mm content)
// ===========================================================================

function buildThermal(args: Omit<BuildArgs, 'copies'>): string {
  const { org, doc, tpl, paper } = args
  const wide = paper === '80mm'
  const lang: Lang = args.lang ?? currentPrintLang()

  const isInvoice = doc.kind === 'invoice'
  const inv = isInvoice ? (doc as PrintInvoiceDoc) : null
  const voc = !isInvoice ? (doc as PrintVoucherDoc) : null

  const widthMm = wide ? 80 : 58
  const fontPx = wide ? 12 : 11
  const padMm = wide ? 4 : 4

  const docTitle = isInvoice
    ? inv!.type === 'PURCHASE'
      ? tr(lang, 'purchaseTitle')
      : tr(lang, 'invoiceNo')
    : tr(lang, doc.kind)

  // ---- header banner -----------------------------------------------------
  const banner = tpl.thermal.showLogoText
    ? [
        '<div class="banner">',
        `<div class="bn-name">${escapeHtml(org.name)}</div>`,
        org.phone ? `<div class="bn-sub"><span class="num-ltr" dir="ltr">${escapeHtml(org.phone)}</span></div>` : '',
        org.address ? `<div class="bn-sub">${escapeHtml(org.address)}</div>` : '',
        '</div>',
        '<div class="sep"></div>',
      ].join('')
    : ''

  // ---- meta lines ----------------------------------------------------------
  const meta: string[] = []
  if (isInvoice) {
    meta.push(dotRow(tr(lang, 'invoiceNo'), escapeHtml(docRef(doc)), { strong: true }))
    meta.push(dotRow(tr(lang, 'date'), fmtDate(doc.date)))
    if (doc.partyName) meta.push(dotRow(inv!.type === 'PURCHASE' ? tr(lang, 'supplier') : tr(lang, 'customer'), escapeHtml(doc.partyName)))
    if (inv!.warehouseName) meta.push(dotRow(tr(lang, 'warehouse'), escapeHtml(inv!.warehouseName)))
  } else {
    meta.push(dotRow(tr(lang, 'docNo'), escapeHtml(docRef(doc)), { strong: true }))
    meta.push(dotRow(tr(lang, 'date'), fmtDate(doc.date)))
    if (doc.partyName)
      meta.push(dotRow(doc.kind === 'receipt' ? tr(lang, 'customer') : tr(lang, 'supplier'), escapeHtml(doc.partyName)))
    if (voc!.method) meta.push(dotRow(tr(lang, 'method'), tr(lang, voc!.method)))
    if (voc!.invoiceNumber != null)
      meta.push(dotRow(tr(lang, 'linkedInvoice'), `INV-${String(voc!.invoiceNumber).padStart(6, '0')}`))
  }

  // ---- items ----------------------------------------------------------------
  let itemsHtml = ''
  if (inv) {
    const maxCh = wide ? 24 : 18
    itemsHtml = inv.items
      .map((it) => {
        const lineTotal = it.total ?? round2(it.qty * it.price)
        const nm = truncateChars(it.nameSnap, maxCh)
        const unitPart = it.unitSnap ? ` ${it.unitSnap}` : ''
        return [
          '<div class="item">',
          `<div class="inm" title="${escapeHtml(it.nameSnap)}">${escapeHtml(nm)}</div>`,
          `<div class="iline">`,
          `<span class="iqp num-ltr" dir="ltr">${fmtQty(it.qty)}${unitPart ? `×${escapeHtml(unitPart.trim())}` : '×'}${fmtQty(it.price)}</span>`,
          '<span class="dots"></span>',
          `<span class="iamt num-ltr" dir="ltr">${fmtMoney(lineTotal, org.currencyCode)}</span>`,
          '</div>',
          '</div>',
        ].join('')
      })
      .join('')
    itemsHtml = `<div class="items">${itemsHtml}</div><div class="sep"></div>`
  }

  // ---- totals -----------------------------------------------------------------
  const totals: string[] = []
  let voucherMain = ''
  if (inv) {
    if ((inv.subtotal ?? 0) > 0) totals.push(dotRow(tr(lang, 'subtotal'), fmtMoney(inv!.subtotal, org.currencyCode)))
    if ((inv.discount ?? 0) > 0) totals.push(dotRow(tr(lang, 'discount'), fmtMoney(inv!.discount, org.currencyCode)))
    if ((inv.taxPercent ?? 0) > 0)
      totals.push(dotRow(`${tr(lang, 'tax')} <span class="num-ltr" dir="ltr">${fmtQty(inv!.taxPercent ?? 0)}%</span>`, fmtMoney(inv!.taxAmount, org.currencyCode)))

    const paid = inv.paidAmount ?? 0
    const remaining = round2(inv.total - paid)
    const change = paid > inv.total ? round2(paid - inv.total) : 0

    totals.push(`<div class="grand num-ltr" dir="ltr"><span>${escapeHtml(tr(lang, 'grandTotal'))}</span> ${fmtMoney(inv.total, org.currencyCode)}</div>`)
    if (paid > 0) totals.push(dotRow(tr(lang, 'paid'), fmtMoney(paid, org.currencyCode)))
    if (remaining > 0.009) totals.push(dotRow(tr(lang, 'remaining'), fmtMoney(remaining, org.currencyCode), { strong: true }))
    if (change > 0.009) totals.push(dotRow(tr(lang, 'change'), fmtMoney(change, org.currencyCode)))
  } else {
    voucherMain = `<div class="grand num-ltr" dir="ltr"><span>${escapeHtml(tr(lang, 'amount'))}</span> ${fmtMoney(voc!.amount, org.currencyCode)}</div>`
  }

  // ---- footer blocks -----------------------------------------------------------
  const qrHtml = tpl.thermal.showQr ? qrPlaceholder(docRef(doc), tr(lang, 'qrNote')) : ''
  const footerMsg = tpl.thermal.footerMsg
    ? `<div class="foot-msg">${escapeHtml(resolveThermalFooter(tpl, lang))}</div>`
    : ''
  const cut = tpl.thermal.cutLine ? '<div class="cut"></div>' : ''

  const content = `
    ${banner}
    <div class="dtitle">${escapeHtml(docTitle)}</div>
    <div class="sep"></div>
    <div class="tmeta">${meta.join('')}</div>
    <div class="sep"></div>
    ${itemsHtml}
    <div class="ttotals">${voucherMain}${totals.join('')}</div>
    ${qrHtml}
    <div class="sep soft"></div>
    ${footerMsg}
    ${cut}`

  const mono = "ui-monospace, SFMono-Regular, Menlo, 'Courier New', monospace"
  const bodyCss = `
    body{width:${widthMm}mm;padding:2mm ${padMm}mm;font-family:${mono};font-size:${fontPx}px;line-height:1.5;
         -webkit-print-color-adjust:exact;print-color-adjust:exact}`

  const css = `
    div{word-break:break-word}
    .banner{text-align:center}
    .bn-name{font-weight:800;font-size:${wide ? 17 : 15}px}
    .bn-sub{font-size:${wide ? 11 : 10}px;color:#333}
    .sep{border-top:1.5px dashed #222;margin:2.2mm 0}
    .sep.soft{border-top-style:dotted;opacity:.65}
    .dtitle{text-align:center;font-weight:800;font-size:calc(${fontPx}px + 2px);letter-spacing:1px}
    .trow{display:flex;align-items:baseline}
    .trow.strong .tl,.trow.strong .tv{font-weight:800}
    .tl{white-space:nowrap;color:#111}
    .dots{flex:1;border-bottom:1px dotted #555;margin-inline:1.2mm;height:.75em;min-width:3mm}
    .tv{text-align:end;direction:ltr}
    .items .item{margin-block:1.4mm}
    .inm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .iline{display:flex;align-items:baseline}
    .iqp{white-space:nowrap;color:#222}
    .iamt{text-align:end;white-space:nowrap}
    .ttotals{margin-block:1mm}
    .grand{margin-block:2mm;font-weight:800;font-size:calc(${fontPx}px + 1px);border-block:1.2px double #000;
           padding:1.4mm 1mm;display:flex;justify-content:space-between;gap:2mm}
    .qr-wrap{text-align:center;margin-block:2.5mm}
    .qr-box{display:inline-flex;align-items:center;justify-content:center;width:${wide ? 20 : 16}mm;height:${wide ? 20 : 16}mm;
            border:1.6px solid #000;border-radius:1.5mm;font-weight:800;letter-spacing:2px;color:#000}
    .qr-ref{font-weight:700;margin-top:1mm}
    .qr-note{font-size:${fontPx - 2}px;color:#444}
    .foot-msg{text-align:center;margin-block:2mm;font-weight:600}
    .cut{border-top:1.5px dashed #222;margin-top:3mm;position:relative}
    .cut::after{content:'✂';position:absolute;inset-inline-start:1mm;top:-.62em;font-size:12px;background:#fff;padding-inline:1mm}
    .bc{text-align:center;font-weight:800;letter-spacing:.8px;margin-top:2mm}
    .num-ltr{unicode-bidi:embed}
    @page{size:${widthMm}mm auto;margin:0}`

  return docShell({
    lang,
    title: `${docTitle} ${docRef(doc)}`,
    bodyCss,
    css,
    content,
    cairoFont: false, // thermal stays monospace/system — driver-friendly
  })
}

/** Language used when callers don't pass one explicitly (print engine sets it). */
function currentPrintLang(): Lang {
  return PRINT_LANG
}

// Module-level language fallback — client.ts calls setPrintLanguage(lang) right
// before rendering so documents follow the app's active UI language.
let PRINT_LANG: Lang = 'ar'

/** Sets the default language for subsequent buildDocHtml calls (printer layer). */
export function setPrintLanguage(lang: Lang): void {
  PRINT_LANG = lang === 'en' ? 'en' : 'ar'
}

/** Truncate on grapheme-safe length with ellipsis (approximation of 18 chars). */
function truncateChars(s: string, max: number): string {
  const t = String(s ?? '').trim()
  return t.length > max ? `${Array.from(t).slice(0, max).join('')}…` : t
}
