'use client'

/**
 * Print engine entry point — CONTRACT OWNED BY ORCHESTRATOR,
 * implementation owned by Task 5-b (PrintDesignAgent).
 *
 * Other modules MUST call this API only; never build their own print HTML.
 *
 * Architecture:
 *   fetchDoc(kind,id)   → normalized PrintableDoc (invoice detail API / vouchers list scan)
 *   loadResolvedTemplate() → draft ⇒ localStorage cache ⇒ GET /api/settings/template ⇒ DEFAULTS (deep-merged)
 *   getOrgSnapshot()    → boot-cache org (name/phone/address/currency), bootstrap fallback
 *   buildDocHtml()      → pure standalone HTML from ../templates (iframe srcdoc)
 *   printViaIframe()    → hidden iframe + contentWindow.print(), cleaned on afterprint/30s
 *
 * Paper modes: 'A4' (formal sheet) | '58mm' | '80mm' (thermal roll receipts).
 * `copies > 1` duplicates the section N times with page-breaks INSIDE one job.
 * `openPreview` is intentionally accepted-but-ignored: live WYSIWYG preview lives
 * in the Designer screen (`views/designer/DesignerView.tsx`) — opening the raw
 * iframe in the app would double-render and confuse the browser dialog focus.
 */
import { toast } from 'sonner'
import { apiGet } from '@/hooks/use-api'
import { readBootCache } from '@/stores/session'
import type { OrgDTO, PaperKind } from '@/lib/types'
import {
  buildDocHtml,
  mergeTemplate,
  setPrintLanguage,
} from './templates'
import type {
  DesignerTemplate,
  PrintableDoc,
  PrintInvoiceDoc,
  PrintOrgInfo,
  PrintVoucherDoc,
} from './templates'

// ---------------------------------------------------------------------------
// Public contract types (FIXED signatures — do not break callers)
// ---------------------------------------------------------------------------

export type PrintDocKind = 'invoice' | 'receipt' | 'payment'
export type PrintPaper = Extract<PaperKind, 'A4' | '58mm' | '80mm'>

export interface PrintOptions {
  paper?: PrintPaper
  copies?: number
  openPreview?: boolean
}

// ---------------------------------------------------------------------------
// Template storage chain (draft ← designer · cache ← last remote save)
// ---------------------------------------------------------------------------

export const TPL_DRAFT_KEY = 'tijara-tpl-draft'
export const TPL_CACHE_KEY = 'tijara-tpl-cache'

/** Designer: persist the currently-edited (possibly unsaved) template. */
export function saveDraftTemplate(tpl: DesignerTemplate): void {
  try {
    localStorage.setItem(TPL_DRAFT_KEY, JSON.stringify(tpl))
  } catch {
    /* storage full/blocked — printing falls back to cache/remote */
  }
}

/** Designer: commit after successful PUT (updates cache + aligns draft). */
export function commitSavedTemplate(tpl: DesignerTemplate): void {
  try {
    localStorage.setItem(TPL_CACHE_KEY, JSON.stringify(tpl))
    localStorage.setItem(TPL_DRAFT_KEY, JSON.stringify(tpl))
  } catch {
    /* ignore */
  }
}

function readJsonSafe(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function readDraftTemplate(): DesignerTemplate | null {
  const v = readJsonSafe(TPL_DRAFT_KEY)
  return v && typeof v === 'object' ? mergeTemplate(v as Partial<DesignerTemplate>) : null
}

/**
 * Resolution order:
 *   1. unsaved designer draft   ('tijara-tpl-draft')  — lets «طباعة تجريبية» honor tweaks
 *   2. last-known remote blob   ('tijara-tpl-cache')  — instant + offline friendly
 *   3. server template          (GET /api/settings/template, may be null → persisted to cache)
 *   4. DEFAULT_TEMPLATE         (deep-merged so every required field exists)
 */
export async function loadResolvedTemplate(): Promise<DesignerTemplate> {
  const draft = readJsonSafe(TPL_DRAFT_KEY)
  if (draft && typeof draft === 'object') return mergeTemplate(draft as Partial<DesignerTemplate>)

  const cached = readJsonSafe(TPL_CACHE_KEY)
  if (cached && typeof cached === 'object') return mergeTemplate(cached as Partial<DesignerTemplate>)

  try {
    const remote = await apiGet<unknown>('/api/settings/template')
    if (remote && typeof remote === 'object') {
      try {
        localStorage.setItem(TPL_CACHE_KEY, JSON.stringify(remote))
      } catch {}
      return mergeTemplate(remote as Partial<DesignerTemplate>)
    }
  } catch {
    /* offline/401 — defaults below */
  }
  return mergeTemplate(null)
}

// ---------------------------------------------------------------------------
// Org snapshot (printed letterhead)
// ---------------------------------------------------------------------------

let orgMemo: { at: number; org: PrintOrgInfo } | null = null
const ORG_MEMO_MS = 60_000

export async function getOrgSnapshot(): Promise<PrintOrgInfo> {
  if (typeof window === 'undefined') return { name: '', currencyCode: 'EGP' }
  const fresh = orgMemo && Date.now() - orgMemo.at < ORG_MEMO_MS ? orgMemo.org : null
  if (fresh) return fresh

  const bootOrg: OrgDTO | null = readBootCache()?.org ?? null
  if (bootOrg?.name) {
    const o = toOrgInfo(bootOrg)
    orgMemo = { at: Date.now(), org: o }
    return o
  }
  try {
    const d = await apiGet<{ org?: OrgDTO | null }>('/api/bootstrap')
    const o = d?.org ? toOrgInfo(d.org) : { name: '', currencyCode: 'EGP' }
    orgMemo = { at: Date.now(), org: o }
    return o
  } catch {
    return { name: '', currencyCode: 'EGP' }
  }
}

function toOrgInfo(o: OrgDTO): PrintOrgInfo {
  return {
    name: o.name || '',
    phone: o.phone ?? null,
    address: o.address ?? null,
    currencyCode: o.currencyCode || 'EGP',
  }
}

// ---------------------------------------------------------------------------
// Document fetching — maps API payloads to PrintableDoc
// ---------------------------------------------------------------------------

async function fetchInvoiceDoc(id: string): Promise<PrintInvoiceDoc | null> {
  interface Raw {
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
    items?: Array<{
      nameSnap: string
      unitSnap?: string | null
      barcodeSnap?: string | null
      qty: number
      price: number
      total?: number
    }>
  }
  try {
    const d = await apiGet<Raw>(`/api/invoices/${encodeURIComponent(id)}`)
    if (!d || typeof d.number !== 'number') return null
    return {
      kind: 'invoice',
      number: d.number,
      type: d.type === 'PURCHASE' ? 'PURCHASE' : 'SALE',
      status: d.status,
      date: d.date,
      partyName: d.partyName ?? null,
      warehouseName: d.warehouseName ?? null,
      createdBy: d.createdBy ?? null,
      subtotal: d.subtotal ?? 0,
      discount: d.discount ?? 0,
      taxPercent: d.taxPercent ?? 0,
      taxAmount: d.taxAmount ?? 0,
      total: Number(d.total ?? 0),
      paidAmount: d.paidAmount ?? 0,
      notes: d.notes ?? null,
      items: (d.items ?? []).map((it) => ({
        nameSnap: it.nameSnap,
        unitSnap: it.unitSnap ?? null,
        barcodeSnap: it.barcodeSnap ?? null,
        qty: Number(it.qty ?? 0),
        price: Number(it.price ?? 0),
        total: it.total != null ? Number(it.total) : undefined,
      })),
    }
  } catch {
    return null
  }
}

async function fetchVoucherDoc(kind: 'receipt' | 'payment', id: string): Promise<PrintVoucherDoc | null> {
  // No direct /api/vouchers/[id] reader route exists; page the list and locate
  // locally (fine volume: newest-first, 100 covers a normal working day).
  interface RawRow {
    id: string
    number: number
    method?: string
    amount: number
    partyName?: string | null
    invoiceNumber?: number | null
    note?: string | null
    date: string
  }
  const type = kind === 'receipt' ? 'RECEIPT' : 'PAYMENT'
  try {
    const d = await apiGet<{ rows?: RawRow[] }>(
      `/api/vouchers?type=${type}&page=1&pageSize=100`
    )
    const row = d.rows?.find((r) => r.id === id)
    if (!row) return null
    return {
      kind,
      number: row.number,
      method: row.method ?? 'CASH',
      amount: Number(row.amount ?? 0),
      partyName: row.partyName ?? null,
      invoiceNumber: row.invoiceNumber ?? null,
      note: row.note ?? null,
      date: row.date,
    }
  } catch {
    return null
  }
}

function fetchDoc(kind: PrintDocKind, id: string): Promise<PrintableDoc | null> {
  if (kind === 'invoice') return fetchInvoiceDoc(id)
  return fetchVoucherDoc(kind === 'receipt' ? 'receipt' : 'payment', id)
}

// ---------------------------------------------------------------------------
// Rendering + printing plumbing
// ---------------------------------------------------------------------------

function sniffLang(): 'ar' | 'en' {
  if (typeof document === 'undefined') return 'ar'
  return document.documentElement.lang === 'en' ? 'en' : 'ar'
}

const FAIL_MSG = {
  ar: 'تعذّر تجهيز الطباعة — تأكد من وجود المستند ثم أعد المحاولة',
  en: 'Could not prepare the printout — make sure the document exists and retry',
}

function failToast(lang: 'ar' | 'en'): void {
  try {
    toast.error(FAIL_MSG[lang])
  } catch {
    /* sonner unavailable in this context */
  }
}

function defaultPaper(tpl: DesignerTemplate, kind: PrintDocKind): PrintPaper {
  if (kind === 'invoice') return 'A4'
  return tpl.thermal.defaultWidth ?? '80mm'
}

/** Hidden off-DOM-flow iframe; Safari-safe sizes; cleaned via afterprint + watchdog. */
function printViaIframe(html: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true
        resolve(ok)
      }
    }

    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('tabindex', '-1')
    frame.setAttribute('title', 'tijara-print-frame')
    frame.style.position = 'fixed'
    frame.style.width = '0'
    frame.style.height = '0'
    frame.style.border = '0'
    frame.style.opacity = '0'
    frame.style.insetInlineEnd = '0'
    frame.style.bottom = '0'

    // Watchdog: never leak frames if neither afterprint nor load fires.
    const watchdog = window.setTimeout(() => {
      try {
        frame.remove()
      } catch {}
      finish(true)
    }, 30_000)

    frame.addEventListener('load', () => {
      try {
        const win = frame.contentWindow
        if (!win) throw new Error('no-content-window')
        try {
          win.addEventListener('afterprint', () => {
            window.clearTimeout(watchdog)
            try {
              frame.remove()
            } catch {}
          })
        } catch {}
        win.focus()
        win.print() // sync dialog spawn in most engines
        finish(true)
      } catch (err) {
        window.clearTimeout(watchdog)
        try {
          frame.remove()
        } catch {}
        console.warn('[print] print() rejected:', err)
        finish(false)
      }
    })

    frame.srcdoc = html
    document.body.appendChild(frame)
  })
}

/** Shared render+print tail for both public entry points. */
async function renderAndPrint(args: {
  org: PrintOrgInfo
  doc: PrintableDoc
  tpl: DesignerTemplate
  paper: PrintPaper
  copies?: number
}): Promise<boolean> {
  const html = buildDocHtml(args)
  return printViaIframe(html)
}

/**
 * Render + print a document by id.
 * Returns true when the document was rendered successfully.
 */
export async function printDoc(
  kind: PrintDocKind,
  id: string,
  opts: PrintOptions = {}
): Promise<boolean> {
  try {
    if (!id) throw new Error('missing-id')
    const lang = sniffLang()
    setPrintLanguage(lang)

    const tpl = await loadResolvedTemplate()
    const paper: PrintPaper = opts.paper ?? defaultPaper(tpl, kind)

    const [org, doc] = await Promise.all([getOrgSnapshot(), fetchDoc(kind, id)])
    if (!doc) throw new Error(`doc-not-found:${kind}:${id}`)

    void opts.openPreview // accepted for contract stability; WYSIWYG lives in the Designer screen

    return await renderAndPrint({ org, doc, tpl, paper, copies: opts.copies })
  } catch (err) {
    console.warn('[print] failed:', err)
    failToast(sniffLang())
    return false
  }
}

/**
 * Engine-side raw printing used by the Designer's «طباعة تجريبية» so an
 * UNSAVED/sample document can be spooled exactly like a real one (the debounced
 * draft template is already consumed by loadResolvedTemplate when needed).
 */
export async function printRawDoc(args: {
  org: PrintOrgInfo
  doc: PrintableDoc
  tpl: DesignerTemplate
  paper: PrintPaper
  copies?: number
}): Promise<boolean> {
  try {
    setPrintLanguage(sniffLang())
    return await renderAndPrint(args)
  } catch (err) {
    console.warn('[print] raw failed:', err)
    failToast(sniffLang())
    return false
  }
}

/**
 * Hook used by views to expose ready-to-use printers.
 * Kept as a stable indirection so Task 5-b can extend behavior without touching callers.
 */
export function usePrinter() {
  return { printDoc, loadResolvedTemplate, getOrgSnapshot }
}
