/**
 * Shared PG test-database bootstrap for the security suites.
 *
 * The production provider is PostgreSQL (docs/DATABASE-MIGRATION.md), so the
 * regression suites run against a real PostgreSQL instance. Each test FILE
 * gets its own database (bun runs test files in parallel) that is dropped,
 * recreated and schema-pushed fresh on every run — CREATE/DROP DATABASE
 * cannot run inside a transaction, hence the separate db execute calls.
 */
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

export function setupPgTestDatabase(name: string): void {
  const PG_ADMIN_URL = 'postgresql://hamd@127.0.0.1:5432/postgres'
  const stmt = (sql: string) => {
    const f = `/tmp/pgtest-${name}-${Math.random().toString(36).slice(2)}.sql`
    writeFileSync(f, sql)
    execSync(`bunx prisma db execute --url ${PG_ADMIN_URL} --file ${f}`, { stdio: 'pipe' })
  }
  stmt(`DROP DATABASE IF EXISTS ${name};`)
  stmt(`CREATE DATABASE ${name};`)
  // process.env.DATABASE_URL is already set by the importing test file.
  execSync(`bunx prisma db push --skip-generate`, { cwd: process.cwd(), env: process.env, stdio: 'pipe' })
}
