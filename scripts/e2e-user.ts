/**
 * Temp E2E admin for report verification — created, used by the browser test,
 * then DELETED (leaves user data untouched). Usage:
 *   DATABASE_URL=... bun scripts/e2e-user.ts create|delete
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

const EMAIL = 'reports-e2e@hamd.test'
const PASSWORD = 'Reports#E2E-2026'

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}


const db = new PrismaClient()

async function main() {
  const cmd = process.argv[2] ?? 'create'
  if (cmd === 'delete') {
    await db.user.deleteMany({ where: { email: EMAIL } })
    console.log('deleted', EMAIL)
    return
  }
  const org = await db.org.findFirst()
  if (!org) throw new Error('no org found')
  const exists = await db.user.findUnique({ where: { email: EMAIL } })
  if (exists) {
    await db.user.delete({ where: { email: EMAIL } })
  }
  await db.user.create({
    data: {
      orgId: org.id,
      email: EMAIL,
      name: 'مدقق التقارير (مؤقت)',
      role: 'ADMIN',
      passwordHash: hashPassword(PASSWORD),
      tokenVersion: 0,
    },
  })
  console.log('created', EMAIL, 'org:', org.id)
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
