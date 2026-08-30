/**
 * Creates (or resets) a dedicated CASHIER user for the Offline POS E2E test.
 * Idempotent: re-running updates the password hash + reactivates.
 * Usage: bun scripts/offline-test-user.ts
 */
import { PrismaClient } from '@prisma/client'
import { scryptSync, randomBytes } from 'crypto'

const db = new PrismaClient()
const EMAIL = 'offline-e2e@hamd.test'
const PASSWORD = 'Offline#2026'

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  const org = await db.org.findFirst({ select: { id: true, name: true } })
  if (!org) throw new Error('no org found')
  const base = {
    passwordHash: hashPassword(PASSWORD),
    role: 'CASHIER',
    active: true,
    name: 'Offline E2E Cashier',
  }
  const user = await db.user.upsert({
    where: { email: EMAIL },
    update: { ...base, tokenVersion: { increment: 1 } },
    create: { email: EMAIL, orgId: org.id, ...base },
  })
  // count products/customers/warehouses for context
  const [products, customers, warehouses] = await Promise.all([
    db.product.count(),
    db.customer.count(),
    db.warehouse.count(),
  ])
  console.log(
    JSON.stringify(
      { ok: true, orgId: org.id, orgName: org.name, userId: user.id, products, customers, warehouses },
      null,
      2
    )
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
