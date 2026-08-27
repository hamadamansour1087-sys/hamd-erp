'use client'

/**
 * Invoice/Voucher Designer — owned by Task 5-b (PrintDesignAgent).
 * Left column: template controls (A4 sheet · thermal roll).
 * Right column: LIVE WYSIWYG preview via a standalone srcdoc iframe fed by the
 * same pure builders used by the real printing engine (`lib/print/templates.ts`),
 * so what you see is byte-for-byte what gets spooled.
 *
 * Persistence: PUT /api/settings/template (full blob) + debounced localStorage
 * draft ('tijara-tpl-draft') that the engine consumes BEFORE remote/template
 * defaults — enabling «طباعة تجريبية» of unsaved tweaks from any screen flow.
 */

import * as React from 'react'
import {
  Database,
  FlaskConical,
  ImagePlus,
  Info,
  Palette,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/shared/page-header'
import { Skeleton } from '@/components/ui/skeleton'

import { useI18n } from '@/lib/i18n'
import { apiGet, ApiError, requestJson } from '@/hooks/use-api'
import { useSession } from '@/stores/session'
import type { PaperKind } from '@/lib/types'
import {
  DEFAULT_TEMPLATE,
  buildDocHtml,
} from '@/lib/print/templates'
import type {
  A4Template,
  DesignerTemplate,
  Lang,
  PrintInvoiceDoc,
  PrintOrgInfo,
  PrintableDoc,
} from '@/lib/print/templates'
import {
  commitSavedTemplate,
  loadResolvedTemplate,
  getOrgSnapshot,
  printDoc,
  printRawDoc,
  saveDraftTemplate,
} from '@/lib/print/client'
import type { PrintPaper } from '@/lib/print/client'

// ---------------------------------------------------------------------------
// Local helpers / constants
// ---------------------------------------------------------------------------

type AreaTab = 'a4' | 'thermal'
type DocKind = 'invoice' | 'receipt' | 'payment'

const ACCENT_PRESETS: Array<{ hex: string; className: string }> = [
  { hex: '#059669', className: 'bg-emerald-600' },
  { hex: '#0f766e', className: 'bg-teal-700' },
  { hex: '#d97706', className: 'bg-amber-600' },
  { hex: '#e11d48', className: 'bg-rose-600' },
  { hex: '#7c3aed', className: 'bg-violet-600' },
  { hex: '#475569', className: 'bg-slate-600' },
]

/** On-screen pixel width of one printed page at CSS 96dpi. */
const NAT_W: Record<PaperKind, number> = { A4: 794, '80mm': 302, '58mm': 219 }
const PREVIEW_H = 1120
const LOGO_MAX_CHARS = 150_000 // ≈110KB binary after base64 inflation

function cloneDefaults(): DesignerTemplate {
  return JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)) as DesignerTemplate
}

function deepCloneSection<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** Decode an image file into a ≤120px-height JPEG data-url (keeps PDF size sane). */
function compressLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read-failed'))
    reader.onload = () => {
      const img = new window.Image()
      img.onerror = () => reject(new Error('decode-failed'))
      img.onload = () => {
        try {
          const ratio = Math.min(1, 120 / Math.max(1, img.height))
          const w = Math.max(1, Math.round(img.width * ratio))
          const h = Math.max(1, Math.round(img.height * ratio))
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('no-2d')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)
          resolve(canvas.toDataURL('image/jpeg', 0.82))
        } catch (err) {
          reject(err instanceof Error ? err : new Error('compress-failed'))
        }
      }
      img.src = String(reader.result ?? '')
    }
    reader.readAsDataURL(file)
  })
}

/** Bilingual complete fixtures mirroring GET /api/invoices/[id] + voucher rows. */
function sampleDoc(lang: Lang, kind: DocKind): PrintableDoc {
  if (kind === 'invoice') {
    const inv: PrintInvoiceDoc =
      lang === 'ar'
        ? {
            kind: 'invoice',
            number: 146,
            type: 'SALE',
            status: 'PARTIAL',
            date: new Date().toISOString(),
            partyName: 'سوبر ماركت الأمانة',
            warehouseName: 'المستودع الرئيسي',
            createdBy: 'محمد أحمد',
            subtotal: 172.5,
            discount: 12.5,
            taxPercent: 14,
            taxAmount: 22.4,
            total: 182.4,
            paidAmount: 150,
            notes: 'التوصيل يوم الأحد صباحاً — يرجى التأكد من تواريخ الصلاحية.',
            items: [
              { nameSnap: 'أرز بسمتي عباد ٥ كجم', unitSnap: 'كيس', barcodeSnap: '6291042900316', qty: 4, price: 28.5, total: 114 },
              { nameSnap: 'زيت عافية دوار الشمس ٢.٢٥ لتر', unitSnap: 'كرتونة', barcodeSnap: '6281006500021', qty: 2, price: 21.75, total: 43.5 },
              { nameSnap: 'شاي العروسة ناعم ١٧٥ جم', unitSnap: null, barcodeSnap: null, qty: 10, price: 1.5, total: 15 },
            ],
          }
        : {
            kind: 'invoice',
            number: 146,
            type: 'SALE',
            status: 'PARTIAL',
            date: new Date().toISOString(),
            partyName: 'Al-Amana Supermarket',
            warehouseName: 'Main Warehouse',
            createdBy: 'Mohamed Ahmed',
            subtotal: 172.5,
            discount: 12.5,
            taxPercent: 14,
            taxAmount: 22.4,
            total: 182.4,
            paidAmount: 150,
            notes: 'Sunday-morning delivery — please double-check expiry dates.',
            items: [
              { nameSnap: 'Abad Basmati Rice 5kg', unitSnap: 'bag', barcodeSnap: '6291042900316', qty: 4, price: 28.5, total: 114 },
              { nameSnap: 'Afia Sunflower Oil 2.25L', unitSnap: 'carton', barcodeSnap: '6281006500021', qty: 2, price: 21.75, total: 43.5 },
              { nameSnap: 'El Arosa Tea 175g', unitSnap: null, barcodeSnap: null, qty: 10, price: 1.5, total: 15 },
            ],
          }
    return inv
  }
  const receipt = kind === 'receipt'
  return {
    kind,
    number: 121,
    method: 'CASH',
    amount: 500,
    partyName: receipt
      ? lang === 'ar'
        ? 'سوبر ماركت الأمانة'
        : 'Al-Amana Supermarket'
      : lang === 'ar'
        ? 'شركة النيل للتوزيع'
        : 'Nile Distribution Co.',
    invoiceNumber: 146,
    note: receipt
      ? lang === 'ar'
        ? 'دفعة على الحساب'
        : 'Payment on account'
      : lang === 'ar'
        ? 'تحصيل مقابل فاتورة مشتريات'
        : 'Collection against purchase invoice',
    date: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Small shared control row
// ---------------------------------------------------------------------------

function CtrlRow({
  label,
  htmlFor,
  children,
}: {
  label: React.ReactNode
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <Label htmlFor={htmlFor} className="min-w-0 shrink-0 pe-1 text-sm font-medium">
        {label}
      </Label>
      <div className="flex min-w-0 justify-end">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function DesignerView() {
  const { t } = useI18n()
  const user = useSession((s) => s.user)
  const isStaff = user?.role === 'ADMIN' || user?.role === 'MANAGER'

  const [tpl, setTpl] = React.useState<DesignerTemplate | null>(null)
  const [areaTab, setAreaTab] = React.useState<AreaTab>('a4')
  const [docKind, setDocKind] = React.useState<DocKind>('invoice')
  const [docLang, setDocLang] = React.useState<Lang>('ar')
  const [saving, setSaving] = React.useState(false)

  /** Latest REAL document fetched for honest previewing (null → sample fixture). */
  const [previewReal, setPreviewReal] = React.useState<{ id: string; doc: PrintableDoc } | null>(null)
  const [usedFallback, setUsedFallback] = React.useState(false)
  const [orgSnap, setOrgSnap] = React.useState<PrintOrgInfo | null>(null)
  const [srcTick, setSrcTick] = React.useState(0)

  const fileRef = React.useRef<HTMLInputElement>(null)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState(1)

  const paper: PrintPaper =
    areaTab === 'a4' ? 'A4' : ((tpl?.thermal.defaultWidth ?? '80mm') as PrintPaper)
  const natW = NAT_W[paper]

  // ---- initial load: resolved template + org letterhead --------------------
  React.useEffect(() => {
    let alive = true
    void Promise.resolve().then(async () => {
      try {
        const resolved = await loadResolvedTemplate()
        if (alive) setTpl(resolved)
      } catch {
        if (alive) setTpl(cloneDefaults())
      }
      try {
        const org = await getOrgSnapshot()
        if (alive) setOrgSnap(org)
      } catch {
        /* preview still works with blank letterhead */
      }
    })
    return () => {
      alive = false
    }
  }, [])

  // ---- latest real document per kind (graceful sample fallback) -------------
  React.useEffect(() => {
    let alive = true
    void Promise.resolve().then(async () => {
      try {
        let entry: { id: string; doc: PrintableDoc } | null = null
        if (docKind === 'invoice') {
          const list = await apiGet<{ rows?: Array<{ id: string }> }>(
            '/api/invoices?page=1&pageSize=1'
          )
          const id = list.rows?.[0]?.id
          if (id) {
            const d = await apiGet<{
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
              items?: PrintInvoiceDoc['items']
            }>(`/api/invoices/${encodeURIComponent(id)}`)
            if (alive && d && typeof d.number === 'number') {
              entry = {
                id,
                doc: {
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
                },
              }
            }
          }
        } else {
          const vType = docKind === 'receipt' ? 'RECEIPT' : 'PAYMENT'
          const list = await apiGet<{
            rows?: Array<{
              id: string
              number: number
              method?: string
              amount: number
              partyName?: string | null
              invoiceNumber?: number | null
              note?: string | null
              date: string
            }>
          }>(`/api/vouchers?type=${vType}&page=1&pageSize=1`)
          const r = list.rows?.[0]
          if (r) {
            entry = {
              id: r.id,
              doc: {
                kind: docKind,
                number: r.number,
                method: r.method ?? 'CASH',
                amount: Number(r.amount ?? 0),
                partyName: r.partyName ?? null,
                invoiceNumber: r.invoiceNumber ?? null,
                note: r.note ?? null,
                date: r.date,
              },
            }
          }
        }
        if (!alive) return
        if (entry) {
          setPreviewReal(entry)
          setUsedFallback(false)
        } else {
          setPreviewReal(null)
          setUsedFallback(true)
        }
      } catch {
        if (!alive) return
        setPreviewReal(null)
        setUsedFallback(true)
        try {
          toast.info(t('dsg.loadFail'))
        } catch {}
      }
    })
    return () => {
      alive = false
    }
  }, [docKind, srcTick, t])

  // ---- debounced draft persistence (consumed by test prints engine-side) ----
  const firstDraft = React.useRef(true)
  React.useEffect(() => {
    if (firstDraft.current) {
      firstDraft.current = false
      return
    }
    if (!tpl) return
    const h = window.setTimeout(() => saveDraftTemplate(tpl), 400)
    return () => window.clearTimeout(h)
  }, [tpl])

  // ---- live HTML (same builder as the printer!) -----------------------------
  const previewDoc: PrintableDoc = React.useMemo(
    () => previewReal?.doc ?? sampleDoc(docLang, docKind),
    [previewReal, docLang, docKind]
  )
  const html = React.useMemo(() => {
    if (!tpl || !previewDoc) return ''
    return buildDocHtml({
      org: orgSnap ?? { name: '', currencyCode: 'EGP' },
      doc: previewDoc,
      tpl,
      paper,
      copies: 1,
      lang: docLang,
    })
  }, [tpl, previewDoc, orgSnap, paper, docLang])

  // ---- responsive preview scaling -------------------------------------------
  React.useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let alive = true
    const applyScale = (w: number) => {
      const s = Math.min(1, Math.max(0.15, (w - 24) / natW))
      if (alive) setScale(Number(s.toFixed(3)))
    }
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width ?? el.clientWidth
      // defer out of the observer tick (react-hooks friendly)
      void Promise.resolve().then(() => applyScale(cw || el.clientWidth))
    })
    ro.observe(el)
    void Promise.resolve().then(() => applyScale(el.clientWidth))
    return () => {
      alive = false
      ro.disconnect()
    }
  }, [natW])

  // ---- section patchers ------------------------------------------------------
  const patchA4 = React.useCallback((p: Partial<A4Template>) => {
    setTpl((prev) => (prev ? { ...prev, a4: { ...prev.a4, ...p } } : prev))
  }, [])
  const patchThermal = React.useCallback((p: Partial<DesignerTemplate['thermal']>) => {
    setTpl((prev) => (prev ? { ...prev, thermal: { ...prev.thermal, ...p } } : prev))
  }, [])

  const resetA4 = () => {
    setTpl((prev) => (prev ? { ...prev, a4: deepCloneSection(DEFAULT_TEMPLATE.a4) } : prev))
  }
  const resetThermal = () => {
    setTpl((prev) => (prev ? { ...prev, thermal: deepCloneSection(DEFAULT_TEMPLATE.thermal) } : prev))
  }

  // ---- logo upload -----------------------------------------------------------
  async function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const url = await compressLogoFile(f)
      if (!url || url.length > LOGO_MAX_CHARS) {
        toast.warning(t('dsg.logoTooBig'))
        return
      }
      patchA4({ logoDataUrl: url })
    } catch {
      toast.warning(t('dsg.logoTooBig'))
    }
  }

  // ---- global actions ----------------------------------------------------------
  async function doSave() {
    if (!tpl) return
    setSaving(true)
    try {
      await requestJson('/api/settings/template', {
        method: 'PUT',
        body: JSON.stringify(tpl),
      })
      commitSavedTemplate(tpl)
      toast.success(t('dsg.saved'))
    } catch (err) {
      const e = err as ApiError
      if (e?.queued) toast.info(t('common.savedOffline'))
      else toast.error(t('dsg.saveErr'))
    } finally {
      setSaving(false)
    }
  }

  function refreshPreview() {
    setSrcTick((x) => x + 1) // re-fetch latest docs…
    void Promise.resolve().then(async () => {
      // …and re-resolve template from the storage chain (covers external edits)
      try {
        setTpl(await loadResolvedTemplate())
      } catch {}
    })
  }

  async function doTestPrint(targetPaper: PrintPaper) {
    if (!tpl || !previewDoc) {
      toast.error(t('common.error'))
      return
    }
    const ok = previewReal
      ? await printDoc(docKind, previewReal.id, { paper: targetPaper })
      : await printRawDoc({
          org: orgSnap ?? { name: '', currencyCode: 'EGP' },
          doc: sampleDoc(docLang, docKind),
          tpl,
          paper: targetPaper,
          copies: 1,
        })
    if (!ok) toast.warning(t('common.error'))
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      <PageHeader title={t('nav.designer')} subtitle={t('dsg.sub')} icon={<Palette className="size-5" aria-hidden />} />

      {/* Sticky global actions under the app topbar */}
      <div className="sticky top-16 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-background/90 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        {/* document language affects rendered sheets only */}
        <div className="flex items-center gap-1 rounded-md border p-0.5" role="group" aria-label={t('dsg.previewLang')}>
          <Button
            type="button"
            size="sm"
            variant={docLang === 'ar' ? 'default' : 'ghost'}
            className="h-8 px-3"
            onClick={() => setDocLang('ar')}
            aria-pressed={docLang === 'ar'}
          >
            عربي
          </Button>
          <Button
            type="button"
            size="sm"
            variant={docLang === 'en' ? 'default' : 'ghost'}
            className="h-8 px-3"
            onClick={() => setDocLang('en')}
            aria-pressed={docLang === 'en'}
          >
            EN
          </Button>
        </div>

        <span className="hidden text-xs text-muted-foreground md:inline">{t('dsg.previewLang')}</span>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={refreshPreview} aria-label={t('dsg.refreshPreview')}>
            <RefreshCw className="me-1 size-4" aria-hidden />
            <span className="hidden sm:inline">{t('dsg.refreshPreview')}</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" disabled={!tpl}>
                <Printer className="me-1 size-4" aria-hidden />
                {t('dsg.testPrint')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void doTestPrint('A4')}>
                {t('dsg.testPrintA4')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void doTestPrint('80mm')}>
                {t('dsg.testPrint80')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void doTestPrint('58mm')}>
                {t('dsg.testPrint58')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {isStaff ? (
            <Button type="button" size="sm" onClick={() => void doSave()} disabled={!tpl || saving}>
              {saving ? <RotateCcw className="me-1 size-4 animate-spin" aria-hidden /> : <Save className="me-1 size-4" aria-hidden />}
              {saving ? t('dsg.saving') : t('dsg.save')}
            </Button>
          ) : (
            <span className="max-w-[220px] text-end text-xs text-muted-foreground">{t('dsg.staffOnly')}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* ============================ LEFT: CONTROLS ============================ */}
        <div className="w-full shrink-0 space-y-4 lg:w-[420px]">
          {/* which document kind lives in the preview */}
          <Tabs value={docKind} onValueChange={(v) => setDocKind(v as DocKind)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="invoice">{t('dsg.tabInvoice')}</TabsTrigger>
              <TabsTrigger value="receipt">{t('dsg.tabReceipt')}</TabsTrigger>
              <TabsTrigger value="payment">{t('dsg.tabPayment')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="-mt-2 text-xs text-muted-foreground">{t('dsg.docSampleHint')}</p>

          <Tabs value={areaTab} onValueChange={(v) => setAreaTab(v as AreaTab)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="a4">{t('dsg.secA4')}</TabsTrigger>
              <TabsTrigger value="thermal">{t('dsg.secThermal')}</TabsTrigger>
            </TabsList>

            {/* ---------------------------- A4 AREA ---------------------------- */}
            <TabsContent value="a4" className="mt-3 focus-visible:outline-none">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{t('dsg.secA4')}</CardTitle>
                      <CardDescription className="text-xs">210 × 297&nbsp;mm</CardDescription>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={resetA4} disabled={!tpl}>
                      <RotateCcw className="me-1 size-3.5" aria-hidden />
                      {t('common.reset')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* identity block */}
                  <CtrlRow label={t('dsg.showLogo')}>
                    <Switch
                      checked={!!tpl?.a4.showLogo}
                      onCheckedChange={(v) => patchA4({ showLogo: v })}
                      disabled={!tpl}
                      aria-label={t('dsg.showLogo')}
                    />
                  </CtrlRow>

                  <div className="rounded-lg border bg-muted/40 p-3">
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onLogoFile(e)} />
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileRef.current?.click()}
                        disabled={!tpl}
                      >
                        <ImagePlus className="me-1 size-4" aria-hidden />
                        {tpl?.a4.logoDataUrl ? t('dsg.logoChange') : t('dsg.logoUpload')}
                      </Button>
                      {tpl?.a4.logoDataUrl ? (
                        <>
                          <img
                            src={tpl.a4.logoDataUrl}
                            alt=""
                            className="h-10 w-auto rounded border bg-white object-contain p-0.5"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            onClick={() => patchA4({ logoDataUrl: null })}
                            aria-label={t('dsg.logoRemove')}
                          >
                            <X className="size-4" aria-hidden />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="dsg-title">{t('dsg.titleLbl')}</Label>
                    <Input
                      id="dsg-title"
                      value={tpl?.a4.title ?? ''}
                      placeholder={t('dsg.titlePh')}
                      onChange={(e) => patchA4({ title: e.target.value })}
                      disabled={!tpl}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="dsg-note">{t('dsg.headerNoteLbl')}</Label>
                    <Textarea
                      id="dsg-note"
                      rows={2}
                      value={tpl?.a4.headerNote ?? ''}
                      placeholder={t('dsg.headerNotePh')}
                      onChange={(e) => patchA4({ headerNote: e.target.value })}
                      disabled={!tpl}
                    />
                  </div>

                  {/* accent */}
                  <div className="grid gap-1.5">
                    <Label>{t('dsg.accent')}</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      {ACCENT_PRESETS.map((p) => (
                        <button
                          key={p.hex}
                          type="button"
                          onClick={() => patchA4({ accent: p.hex })}
                          aria-label={`${t('dsg.accent')} ${p.hex}`}
                          className={`size-7 rounded-full ring-offset-2 transition ${p.className} ${
                            (tpl?.a4.accent ?? '').toLowerCase() === p.hex
                              ? 'ring-2 ring-primary ring-offset-background'
                              : ''
                          }`}
                        />
                      ))}
                      <label className="ms-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {t('dsg.accentCustom')}
                        <Input
                          type="color"
                          value={/^#[0-9a-fA-F]{6}$/.test(tpl?.a4.accent ?? '') ? tpl!.a4.accent : '#0f766e'}
                          onChange={(e) => patchA4({ accent: e.target.value })}
                          className="h-8 w-11 cursor-pointer p-0.5"
                          disabled={!tpl}
                          aria-label={t('dsg.accentCustom')}
                        />
                        <span className="num-ltr font-mono text-[11px] uppercase">{tpl?.a4.accent}</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>{t('dsg.fontFamilyLbl')}</Label>
                      <Select
                        value={tpl?.a4.fontFamily ?? 'cairo'}
                        onValueChange={(v) => patchA4({ fontFamily: v })}
                        disabled={!tpl}
                      >
                        <SelectTrigger aria-label={t('dsg.fontFamilyLbl')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cairo">{t('dsg.fontCairo')}</SelectItem>
                          <SelectItem value="system">{t('dsg.fontSystem')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5 content-center">
                      <Label htmlFor="dsg-fs" className="text-sm">
                        {t('dsg.fontSizeLbl', { n: tpl?.a4.fontSize ?? 12 })}
                      </Label>
                      <Slider
                        id="dsg-fs"
                        min={10}
                        max={14}
                        step={1}
                        value={[tpl?.a4.fontSize ?? 12]}
                        onValueChange={(v) => patchA4({ fontSize: v?.[0] ?? 12 })}
                        disabled={!tpl}
                        aria-label={t('dsg.fontSizeLbl', { n: tpl?.a4.fontSize ?? 12 })}
                      />
                    </div>
                  </div>

                  {/* columns */}
                  <div>
                    <Label className="mb-1.5 block text-sm">{t('dsg.columnsHdr')}</Label>
                    <div className="grid grid-cols-2 gap-x-4">
                      <CtrlRow label={t('dsg.colBarcode')}>
                        <Switch
                          checked={!!tpl?.a4.columns.barcode}
                          onCheckedChange={(v) =>
                            tpl && patchA4({ columns: { ...tpl.a4.columns, barcode: v } })
                          }
                          disabled={!tpl}
                          aria-label={t('dsg.colBarcode')}
                        />
                      </CtrlRow>
                      <CtrlRow label={t('dsg.colUnit')}>
                        <Switch
                          checked={!!tpl?.a4.columns.unit}
                          onCheckedChange={(v) => tpl && patchA4({ columns: { ...tpl.a4.columns, unit: v } })}
                          disabled={!tpl}
                          aria-label={t('dsg.colUnit')}
                        />
                      </CtrlRow>
                      <CtrlRow label={t('dsg.colItemPrice')}>
                        <Switch
                          checked={!!tpl?.a4.columns.itemPrice}
                          onCheckedChange={(v) =>
                            tpl && patchA4({ columns: { ...tpl.a4.columns, itemPrice: v } })
                          }
                          disabled={!tpl}
                          aria-label={t('dsg.colItemPrice')}
                        />
                      </CtrlRow>
                      <CtrlRow label={t('dsg.colItemTotal')}>
                        <Switch
                          checked={!!tpl?.a4.columns.itemTotal}
                          onCheckedChange={(v) =>
                            tpl && patchA4({ columns: { ...tpl.a4.columns, itemTotal: v } })
                          }
                          disabled={!tpl}
                          aria-label={t('dsg.colItemTotal')}
                        />
                      </CtrlRow>
                    </div>
                  </div>

                  <div className="h-px bg-border" role="presentation" />

                  <CtrlRow label={t('dsg.swTaxRow')}>
                    <Switch
                      checked={!!tpl?.a4.showTaxRow}
                      onCheckedChange={(v) => patchA4({ showTaxRow: v })}
                      disabled={!tpl}
                      aria-label={t('dsg.swTaxRow')}
                    />
                  </CtrlRow>
                  <CtrlRow label={t('dsg.swDiscountRow')}>
                    <Switch
                      checked={!!tpl?.a4.showDiscountRow}
                      onCheckedChange={(v) => patchA4({ showDiscountRow: v })}
                      disabled={!tpl}
                      aria-label={t('dsg.swDiscountRow')}
                    />
                  </CtrlRow>
                  <CtrlRow label={t('dsg.swSignatures')}>
                    <Switch
                      checked={!!tpl?.a4.signatureLines}
                      onCheckedChange={(v) => patchA4({ signatureLines: v })}
                      disabled={!tpl}
                      aria-label={t('dsg.swSignatures')}
                    />
                  </CtrlRow>
                  <CtrlRow label={t('dsg.swBarcodeFooter')}>
                    <Switch
                      checked={!!tpl?.a4.showBarcodeFooter}
                      onCheckedChange={(v) => patchA4({ showBarcodeFooter: v })}
                      disabled={!tpl}
                      aria-label={t('dsg.swBarcodeFooter')}
                    />
                  </CtrlRow>
                  <div>
                    <CtrlRow label={t('dsg.swWatermark')}>
                      <Switch
                        checked={!!tpl?.a4.watermark}
                        onCheckedChange={(v) => patchA4({ watermark: v })}
                        disabled={!tpl}
                        aria-label={t('dsg.swWatermark')}
                      />
                    </CtrlRow>
                    {tpl?.a4.watermark ? (
                      <p className="-mt-1 flex items-center gap-1 ps-1 text-xs text-amber-600 dark:text-amber-400">
                        <Info className="size-3 shrink-0" aria-hidden />
                        {t('dsg.watermarkNote')}
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* -------------------------- THERMAL AREA -------------------------- */}
            <TabsContent value="thermal" className="mt-3 focus-visible:outline-none">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{t('dsg.secThermal')}</CardTitle>
                      <CardDescription className="text-xs">ESC/POS · 58&nbsp;mm / 80&nbsp;mm</CardDescription>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={resetThermal} disabled={!tpl}>
                      <RotateCcw className="me-1 size-3.5" aria-hidden />
                      {t('common.reset')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-1.5">
                    <Label>{t('dsg.widthLbl')}</Label>
                    <RadioGroup
                      value={tpl?.thermal.defaultWidth ?? '80mm'}
                      onValueChange={(v) => patchThermal({ defaultWidth: v === '58mm' ? '58mm' : '80mm' })}
                      disabled={!tpl}
                      className="grid grid-cols-2 gap-2"
                    >
                      {(['58mm', '80mm'] as const).map((wv) => (
                        <Label
                          key={wv}
                          htmlFor={`dsg-w-${wv}`}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition ${
                            (tpl?.thermal.defaultWidth ?? '80mm') === wv
                              ? 'border-primary bg-primary/5'
                              : ''
                          }`}
                        >
                          <RadioGroupItem id={`dsg-w-${wv}`} value={wv} />
                          <span className="text-sm font-medium">{t(wv === '58mm' ? 'dsg.w58' : 'dsg.w80')}</span>
                        </Label>
                      ))}
                    </RadioGroup>
                    <p className="ps-1 text-xs text-muted-foreground">{t('dsg.widthAutoSwitch')}</p>
                  </div>

                  <CtrlRow label={t('dsg.showLogoText')}>
                    <Switch
                      checked={!!tpl?.thermal.showLogoText}
                      onCheckedChange={(v) => patchThermal({ showLogoText: v })}
                      disabled={!tpl}
                      aria-label={t('dsg.showLogoText')}
                    />
                  </CtrlRow>

                  <div>
                    <CtrlRow label={t('dsg.showQr')}>
                      <Switch
                        checked={!!tpl?.thermal.showQr}
                        onCheckedChange={(v) => patchThermal({ showQr: v })}
                        disabled={!tpl}
                        aria-label={t('dsg.showQr')}
                      />
                    </CtrlRow>
                    {tpl?.thermal.showQr ? (
                      <p className="-mt-1 ps-1 text-xs leading-relaxed text-muted-foreground">
                        {t('dsg.qrNote')}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="dsg-footer">{t('dsg.footerMsgLbl')}</Label>
                    <Input
                      id="dsg-footer"
                      value={tpl?.thermal.footerMsg ?? ''}
                      placeholder={t('dsg.footerMsgPh')}
                      onChange={(e) => patchThermal({ footerMsg: e.target.value })}
                      disabled={!tpl}
                    />
                  </div>

                  <CtrlRow label={t('dsg.cutLine')}>
                    <Switch
                      checked={!!tpl?.thermal.cutLine}
                      onCheckedChange={(v) => patchThermal({ cutLine: v })}
                      disabled={!tpl}
                      aria-label={t('dsg.cutLine')}
                    />
                  </CtrlRow>

                  <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
                    <Info className="me-0.5 mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {t('dsg.escposHint')}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* ============================ RIGHT: LIVE PREVIEW ============================ */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold md:text-base">{t('dsg.previewTitle')}</h2>
            {tpl ? (
              <Badge variant={usedFallback || !previewReal ? 'secondary' : 'default'} className="gap-1">
                {previewReal ? (
                  <Database className="size-3" aria-hidden />
                ) : (
                  <FlaskConical className="size-3" aria-hidden />
                )}
                {previewReal ? t('dsg.liveData') : t('dsg.sampleData')}
              </Badge>
            ) : null}
            <Badge variant="outline" className="num-ltr">
              {paper}
            </Badge>
          </div>

          {!tpl || !html ? (
            <div className="min-h-[70vh] rounded-lg border bg-muted p-4 shadow-inner">
              <div className="mx-auto max-w-[420px] space-y-3">
                <Skeleton className="h-10 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ) : (
            <div
              ref={wrapRef}
              className="min-h-[70vh] w-full overflow-hidden rounded-lg border bg-muted px-2 py-3 shadow-inner"
            >
              <div
                className="mx-auto overflow-hidden bg-white shadow-md"
                style={{ width: natW * scale, height: PREVIEW_H * scale }}
              >
                <iframe
                  title="tijara-template-preview"
                  srcDoc={html}
                  style={{
                    width: natW,
                    height: PREVIEW_H,
                    border: '0',
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
