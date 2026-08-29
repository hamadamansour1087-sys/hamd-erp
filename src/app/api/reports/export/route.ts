import { NextRequest, NextResponse } from 'next/server'
import { getSession, isStaff } from '@/lib/auth'
import { forbidden, unauthorized, readJson } from '@/lib/api-helpers'
import { generateReportWorkbook, type ExcelLang, type ReportKind } from '@/lib/reports/excel-report'

const KINDS: ReportKind[] = ['overview', 'products', 'stock', 'balances']
const DAYS = [7, 30, 90, 180]

/**
 * POST /api/reports/export  { report: overview|products|stock|balances, days, lang }
 * Returns a styled .xlsx workbook (company letterhead + logo, zebra tables,
 * real numeric cells, RTL sheet views in the Arabic version).
 */
export async function POST(req: NextRequest) {
  const s = await getSession(req)
  if (!s) return unauthorized()
  if (!isStaff(s)) return forbidden()

  const body = await readJson(req, 64_000)

  const kind = (KINDS as string[]).includes(String(body.report)) ? (body.report as ReportKind) : null
  if (!kind) return NextResponse.json({ error: 'INVALID_REPORT' }, { status: 400 })

  const daysRaw = Number(body.days)
  const days = DAYS.includes(daysRaw) ? daysRaw : 30
  const lang: ExcelLang = body.lang === 'en' ? 'en' : 'ar'

  const { buffer, filename } = await generateReportWorkbook({ orgId: s.orgId, kind, days, lang })

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="hamd-report.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  })
}
