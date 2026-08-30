// H.A.M.D — production daemonizer (self-hosted / preview boxes)
// Double-fork pattern (same as pg_ctl): parent spawns a detached child in a
// NEW SESSION, then exits immediately → child reparents to init and survives
// the invoking shell's teardown (proven to work: postgres via pg_ctl survives).
//
// PORTABILITY: every path resolves from process.cwd() (the project root you
// run it from) or from environment variables — no machine-specific paths.
//
// Usage (from the project root, AFTER a successful `npm run build`):
//   DAEMON_SECRET=$(openssl rand -hex 32) node scripts/daemon-start.mjs
// Optional overrides: DAEMON_PORT (default 3000), DAEMON_DB (postgres URL),
// DAEMON_LOG (default ./.daemon-<PORT>.log next to the project).
import { fork } from 'node:child_process'
import { openSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PORT = process.env.DAEMON_PORT ?? '3000'
const DB = process.env.DAEMON_DB ?? 'postgresql://hamd@127.0.0.1:5432/hamd'
const CWD = process.cwd()
const LOG = process.env.DAEMON_LOG ?? join(CWD, `.daemon-${PORT}.log`)

// Fail fast with an actionable message instead of booting a server whose
// sessions all fail signature verification (instrumentation.ts also guards
// this at runtime — this check makes the failure obvious at launch time).
if (!process.env.DAEMON_SECRET) {
  console.error(
    '[daemon] FATAL: DAEMON_SECRET is required — it becomes AUTH_SECRET for the Next.js server.\n' +
      '         Example: DAEMON_SECRET=$(openssl rand -hex 32) node scripts/daemon-start.mjs',
  )
  process.exit(1)
}
const SECRET = process.env.DAEMON_SECRET

const server = join(CWD, '.next', 'standalone', 'server.js')
if (!existsSync(server)) {
  console.error(`[daemon] FATAL: ${server} not found — run the build first (npm run build) from ${CWD}`)
  process.exit(1)
}

const out = openSync(LOG, 'a')

const child = fork(server, [], {
  cwd: CWD,
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    PORT,
    NODE_ENV: 'production',
    DATABASE_URL: DB,
    AUTH_SECRET: SECRET,
  },
  stdio: ['ignore', out, out, 'ipc'],
  detached: true,
})
child.unref()
console.log(`daemon launched: pid=${child.pid} port=${PORT} db=${DB.split('@')[1] ?? DB} log=${LOG}`)
process.exit(0)
