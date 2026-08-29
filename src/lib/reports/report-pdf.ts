/**
 * report-pdf.ts — client-side direct .pdf download for reports.
 * Strategy: build a styled report DOM (browser renders Arabic shaping +
 * letterhead logo pixel-perfectly), rasterize with html2canvas-pro, then
 * slice the canvas into A4 pages inside a real jsPDF document.
 * Dynamic imports keep jspdf/html2canvas out of the main bundle.
 */

export interface PdfTable {
  title: string
  headers: string[]
  rows: Array<Array<string | number>>
  emphasisFirstRow?: boolean
}

export interface PdfReportModel {
  title: string
  subtitle: string
  brand: string
  logo?: string | null
  phone?: string | null
  address?: string | null
  dir: 'rtl' | 'ltr'
  rangeLabel?: string
  kpis?: Array<{ label: string; value: string }>
  tables: PdfTable[]
  filename: string
}

/**
 * Logo policy (see SECURITY-AUDIT.md): data:image URLs ONLY.
 * Remote http(s) logos are rejected everywhere — no client-side fetch of
 * user-provided URLs, and the CSP (img-src 'self' data: blob:) blocks them
 * at the browser level too.
 *
 * STRICT server-parity allowlist (mirrors settings/org PUT): raster formats
 * only, mandatory base64 payload, hard length cap. A bare
 * startsWith('data:image/') would let a stored value like
 * `data:image/png,1" onerror="...` pass this check and ESCAPE the src
 * attribute in the <img> below — a stored XSS executed on every report the
 * org prints. The base64 charset test guarantees no quotes/spaces can ever
 * appear in the returned URL; the attribute template escapes it anyway.
 */
function toDataUrl(url: string | null | undefined): string | null {
  if (!url || url.length > 600_000) return null
  return /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url) ? url : null
}

function buildContainer(model: PdfReportModel, logoUrl: string | null): HTMLDivElement {
  const esc = (v: string | number) =>
    String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

  const kpisHtml = model.kpis?.length
    ? `<div class="kpis">${model.kpis
        .map((k) => `<div class="kpi"><span>${esc(k.label)}</span><b>${esc(k.value)}</b></div>`)
        .join('')}</div>`
    : ''

  const tablesHtml = model.tables
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
      </section>`,
    )
    .join('')

  // esc(logoUrl): belt-and-braces — toDataUrl's charset allowlist already
  // excludes quotes, but the attribute must never trust that upstream.
  const logoHtml = logoUrl
    ? `<img class="logo" src="${esc(logoUrl)}" alt="" />`
    : `<div class="mark">H</div>`
  const contact = [model.phone, model.address].filter(Boolean).join(' · ')

  const wrap = document.createElement('div')
  wrap.id = 'hamd-pdf-report'
  wrap.setAttribute('dir', model.dir)
  wrap.setAttribute('lang', model.dir === 'rtl' ? 'ar' : 'en')
  wrap.style.cssText = 'position:fixed;top:0;left:-99999px;width:900px;z-index:-1;background:#ffffff;'
  wrap.innerHTML = `
<style>
  #hamd-pdf-report{font-family:'Cairo','Segoe UI',Tahoma,sans-serif;color:#0f172a;background:#fff;padding:26px 30px}
  #hamd-pdf-report header{display:flex;align-items:flex-start;gap:14px;border-bottom:3px solid #10b981;padding-bottom:14px;margin-bottom:16px}
  #hamd-pdf-report .logo{width:64px;height:64px;border-radius:14px;object-fit:contain;background:#fff}
  #hamd-pdf-report .mark{width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:26px;flex-shrink:0}
  #hamd-pdf-report h1{font-size:21px;margin:0;font-weight:800}
  #hamd-pdf-report .sub{font-size:12px;color:#64748b;margin-top:3px}
  #hamd-pdf-report .contact{font-size:11.5px;color:#059669;margin-top:3px;font-weight:600}
  #hamd-pdf-report .range{margin-inline-start:auto;font-size:12px;background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;padding:5px 12px;border-radius:999px;white-space:nowrap;flex-shrink:0}
  #hamd-pdf-report .kpis{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}
  #hamd-pdf-report .kpi{flex:1 1 170px;border:1px solid #e2e8f0;border-radius:12px;padding:10px 14px;background:#f8fafc}
  #hamd-pdf-report .kpi span{display:block;font-size:11px;color:#64748b}
  #hamd-pdf-report .kpi b{font-size:16px}
  #hamd-pdf-report .tbl{margin-bottom:22px}
  #hamd-pdf-report h2{font-size:14px;margin:0 0 8px;color:#065f46;font-weight:800}
  #hamd-pdf-report table{width:100%;border-collapse:collapse;font-size:12px}
  #hamd-pdf-report th{background:#ecfdf5;color:#064e3b;text-align:start;padding:8px 10px;border:1px solid #d1fae5;font-weight:800}
  #hamd-pdf-report td{padding:7px 10px;border:1px solid #e2e8f0}
  #hamd-pdf-report tr:nth-child(even) td{background:#f8fafc}
  #hamd-pdf-report tr.strong td{background:#ecfdf5;font-weight:800}
  #hamd-pdf-report td.empty{text-align:center;color:#94a3b8}
  #hamd-pdf-report footer{margin-top:26px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px}
</style>
<header>
  ${logoHtml}
  <div>
    <h1>${esc(model.brand)} — ${esc(model.title)}</h1>
    <div class="sub">${esc(model.subtitle)}</div>
    ${contact ? `<div class="contact">${esc(contact)}</div>` : ''}
  </div>
  ${model.rangeLabel ? `<div class="range">${esc(model.rangeLabel)}</div>` : ''}
</header>
${kpisHtml}
${tablesHtml}
<footer>${esc(model.brand)} · ${esc(new Date().toLocaleString(model.dir === 'rtl' ? 'ar-EG' : 'en-GB'))}</footer>`
  return wrap
}

/** Generate the PDF and trigger the browser download. Throws on failure. */
export async function downloadReportPdf(model: PdfReportModel): Promise<void> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas-pro'),
  ])

  const logoUrl = toDataUrl(model.logo)

  const wrap = buildContainer(model, logoUrl)
  document.body.appendChild(wrap)

  try {
    // wait one frame so fonts/images inside the container are laid out
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    const canvas = await html2canvas(wrap, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: 960,
    })

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const pxPerPt = canvas.width / pageW
    const sliceHpx = Math.floor(pageH * pxPerPt)

    let y = 0
    let first = true
    while (y < canvas.height) {
      const h = Math.min(sliceHpx, canvas.height - y)
      const c = document.createElement('canvas')
      c.width = canvas.width
      c.height = h
      const ctx = c.getContext('2d')
      if (!ctx) throw new Error('canvas-2d-unavailable')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
      if (!first) pdf.addPage()
      pdf.addImage(c.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, pageW, h / pxPerPt, undefined, 'FAST')
      first = false
      y += h
    }
    pdf.save(model.filename)
  } finally {
    wrap.remove()
  }
}
