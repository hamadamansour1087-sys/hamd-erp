// Cleanup demo org (بقالة الوفاء) from production — FK-ordered deletion.
import pg from 'pg'

const DIRECT = process.env.DIRECT_DB
const ORG = 'cmti4jv8u0001ib04vn47k58h'

const client = new pg.Client({ connectionString: DIRECT, ssl: 'require' })
await client.connect()

const steps = [
  ['InvoiceItem', 'DELETE FROM "InvoiceItem" WHERE "invoiceId" IN (SELECT id FROM "Invoice" WHERE "orgId"=$1)'],
  ['Invoice', 'DELETE FROM "Invoice" WHERE "orgId"=$1'],
  ['Voucher', 'DELETE FROM "Voucher" WHERE "orgId"=$1'],
  ['Expense', 'DELETE FROM "Expense" WHERE "orgId"=$1'],
  ['StockMovement', 'DELETE FROM "StockMovement" WHERE "orgId"=$1'],
  ['StockLevel', 'DELETE FROM "StockLevel" WHERE "productId" IN (SELECT id FROM "Product" WHERE "orgId"=$1)'],
  ['Product', 'DELETE FROM "Product" WHERE "orgId"=$1'],
  ['Category', 'DELETE FROM "Category" WHERE "orgId"=$1'],
  ['Unit', 'DELETE FROM "Unit" WHERE "orgId"=$1'],
  ['Warehouse', 'DELETE FROM "Warehouse" WHERE "orgId"=$1'],
  ['Customer', 'DELETE FROM "Customer" WHERE "orgId"=$1'],
  ['Supplier', 'DELETE FROM "Supplier" WHERE "orgId"=$1'],
  ['Counter', 'DELETE FROM "Counter" WHERE "orgId"=$1'],
  ['TransferItem', 'DELETE FROM "TransferItem" WHERE "transferId" IN (SELECT id FROM "Transfer" WHERE "orgId"=$1)'],
  ['Transfer', 'DELETE FROM "Transfer" WHERE "orgId"=$1'],
  ['User', 'DELETE FROM "User" WHERE "orgId"=$1'],
  ['Org', 'DELETE FROM "Org" WHERE id=$1'],
]

for (const [name, sql] of steps) {
  try {
    const r = await client.query(sql, [ORG])
    console.log(`${name}: deleted ${r.rowCount}`)
  } catch (e) {
    console.log(`${name}: SKIP (${e.message.slice(0, 60)})`)
  }
}

// rate-limit ledger for the register IP used during seeding
try {
  const r = await client.query(`DELETE FROM "RateLimitEvent" WHERE "bucketKey" LIKE 'register:%'`)
  console.log(`RateLimitEvent(register): ${r.rowCount}`)
} catch (e) { console.log('RateLimitEvent: SKIP') }

const left = await client.query('SELECT name, status FROM "Org" ORDER BY "createdAt"')
console.log('remaining orgs:', left.rows.map((o) => `${o.name}[${o.status}]`).join(' · '))
await client.end()
