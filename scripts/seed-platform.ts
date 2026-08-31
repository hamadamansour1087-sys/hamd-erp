/**
 * Seed script — platform super-admin (H.A.M.D staff account).
 *
 * Idempotent: if a SUPERADMIN user already exists the script exits without
 * touching anything. The platform org is protected from delete/suspend by the
 * API (cannot-touch-platform-org).
 *
 * Credentials: PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD env override;
 * otherwise email owner@hamd.app and a random generated password, which the
 * script SAVES to .pgdata/preview-env.txt (chmod 600, gitignored) next to the
 * daemon secret.
 *
 * Run: DATABASE_URL=postgresql://hamd@127.0.0.1:5432/hamd bun scripts/seed-platform.ts
 */
import { hashPassword } from '../src/lib/auth'
import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'crypto'
import { appendFileSync, chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

const PLATFORM_ORG_NAME = 'H.A.M.D — إدارة النظام'
const DEFAULT_EMAIL = 'owner@hamd.app'

async function main() {
  const existing = await prisma.user.findFirst({ where: { role: 'SUPERADMIN' } })
  if (existing) {
    console.log(`[seed-platform] SUPERADMIN already exists: ${existing.email} — nothing to do.`)
    return
  }

  let org = await prisma.org.findFirst({
    where: { name: PLATFORM_ORG_NAME },
    select: { id: true },
  })
  if (!org) {
    org = await prisma.org.create({
      data: {
        name: PLATFORM_ORG_NAME,
        currencyCode: 'EGP',
        taxPercent: 14,
        status: 'ACTIVE',
        approvedAt: new Date(),
        adminNote: 'منظمة المنصة — حسابات شركة H.A.M.D الداخلية',
      },
      select: { id: true },
    })
  }

  const email = (process.env.PLATFORM_ADMIN_EMAIL || DEFAULT_EMAIL).toLowerCase()
  const password = process.env.PLATFORM_ADMIN_PASSWORD || randomBytes(9).toString('base64url')

  await prisma.user.create({
    data: {
      orgId: org.id,
      email,
      name: 'إدارة H.A.M.D',
      passwordHash: hashPassword(password),
      role: 'SUPERADMIN',
      active: true,
    },
  })

  console.log(`[seed-platform] created SUPERADMIN ${email}`)

  // Persist credentials for the operator (same store as the daemon secret).
  if (!process.env.PLATFORM_ADMIN_PASSWORD) {
    try {
      const envPath = join(process.cwd(), '.pgdata', 'preview-env.txt')
      const line = (k: string, v: string) => `${k}=${v}`
      if (existsSync(envPath)) {
        const kept = readFileSync(envPath, 'utf8')
          .split('\n')
          .filter((l) => l.trim() && !l.startsWith('PLATFORM_ADMIN_'))
        kept.push(line('PLATFORM_ADMIN_EMAIL', email), line('PLATFORM_ADMIN_PASSWORD', password))
        const tmp = envPath + '.tmp'
        writeFileSync(tmp, kept.join('\n') + '\n')
        renameSync(tmp, envPath)
      } else {
        appendFileSync(envPath, line('PLATFORM_ADMIN_EMAIL', email) + '\n' + line('PLATFORM_ADMIN_PASSWORD', password) + '\n')
      }
      chmodSync(envPath, 0o600)
      console.log(`[seed-platform] credentials saved to ${envPath}`)
    } catch (e) {
      console.warn('[seed-platform] could not persist credentials file:', (e as Error).message)
      console.log(`[seed-platform] PASSWORD (save it now): ${password}`)
    }
  }
}

main()
  .catch((e) => {
    console.error('[seed-platform] failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
