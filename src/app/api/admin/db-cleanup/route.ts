import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ONE-OFF maintenance route: FK-ordered deletion of a demo org whose data
// cannot be removed through the cascade (StockLevel/StockMovement RESTRICT).
// Guarded by a one-time key; this file is removed right after use.

const KEY = 'cleanup-2026-9f3a1c-x7'

export async function POST(req: NextRequest) {
  if (req.headers.get('x-key') !== KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const ORG = String(body.orgId || '')
  if (!ORG) return NextResponse.json({ error: 'orgId-required' }, { status: 400 })

  const steps: Array<[string, string]> = [
    ['StockMovement',
      `DELETE FROM "StockMovement" WHERE "orgId"='${ORG}' OR "productId" IN (SELECT id FROM "Product" WHERE "orgId"='${ORG}')`],
    ['StockLevel',
      `DELETE FROM "StockLevel" WHERE "productId" IN (SELECT id FROM "Product" WHERE "orgId"='${ORG}') OR "warehouseId" IN (SELECT id FROM "Warehouse" WHERE "orgId"='${ORG}')`],
    ['Product', `DELETE FROM "Product" WHERE "orgId"='${ORG}'`],
    ['Warehouse', `DELETE FROM "Warehouse" WHERE "orgId"='${ORG}'`],
    ['Unit', `DELETE FROM "Unit" WHERE "orgId"='${ORG}'`],
    ['Category', `DELETE FROM "Category" WHERE "orgId"='${ORG}'`],
    ['Customer', `DELETE FROM "Customer" WHERE "orgId"='${ORG}'`],
    ['Supplier', `DELETE FROM "Supplier" WHERE "orgId"='${ORG}'`],
    ['InvoiceItem',
      `DELETE FROM "InvoiceItem" WHERE "invoiceId" IN (SELECT id FROM "Invoice" WHERE "orgId"='${ORG}')`],
    ['Invoice', `DELETE FROM "Invoice" WHERE "orgId"='${ORG}'`],
    ['Voucher', `DELETE FROM "Voucher" WHERE "orgId"='${ORG}'`],
    ['Expense', `DELETE FROM "Expense" WHERE "orgId"='${ORG}'`],
    ['TransferItem',
      `DELETE FROM "TransferItem" WHERE "transferId" IN (SELECT id FROM "Transfer" WHERE "orgId"='${ORG}')`],
    ['Transfer', `DELETE FROM "Transfer" WHERE "orgId"='${ORG}'`],
    ['Counter', `DELETE FROM "Counter" WHERE "orgId"='${ORG}'`],
    ['User', `DELETE FROM "User" WHERE "orgId"='${ORG}'`],
    ['RateLimitEvent', `DELETE FROM "RateLimitEvent" WHERE "bucketKey" LIKE 'register:%'`],
    ['Org', `DELETE FROM "Org" WHERE id='${ORG}'`],
  ]

  const results: Record<string, number | string> = {}
  for (const [name, sql] of steps) {
    try {
      results[name] = await db.$executeRawUnsafe(sql)
    } catch (e) {
      results[name] = `ERR: ${(e as Error).message.slice(0, 120)}`
    }
  }
  return NextResponse.json({ ok: true, results })
}
