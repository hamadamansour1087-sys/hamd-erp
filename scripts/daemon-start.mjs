// H.A.M.D — production preview daemonizer
// Double-fork pattern (same as pg_ctl): parent spawns a detached child in a
// NEW SESSION, then exits immediately → child reparents to init and survives
// the invoking shell's teardown (proven to work: postgres via pg_ctl survives).
import { spawn, fork } from 'node:child_process'
import { openSync } from 'node:fs'

const PORT = process.env.DAEMON_PORT ?? '3000'
const DB = process.env.DAEMON_DB ?? 'postgresql://hamd@127.0.0.1:5432/hamd'
const SECRET = process.env.DAEMON_SECRET ?? ''

const out = openSync('/home/z/pgdata/preview-3000.log', 'a')

const child = fork('.next/standalone/server.js', [], {
  cwd: '/home/z/my-project',
  env: {
    PATH: process.env.PATH,
    HOME: '/home/z',
    PORT,
    NODE_ENV: 'production',
    DATABASE_URL: DB,
    AUTH_SECRET: SECRET,
  },
  stdio: ['ignore', out, out, 'ipc'],
  detached: true,
})
child.unref()
console.log(`daemon launched: pid=${child.pid} port=${PORT} db=${DB.split('@')[1] ?? DB}`)
process.exit(0)
