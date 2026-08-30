// H.A.M.D — post-build step for SELF-HOSTED / sandbox runs ONLY.
//
// `next build` with output:"standalone" produces .next/standalone WITHOUT the
// static assets and public/ (they are expected to be copied next to the
// server). On VERCEL this directory does not exist — Vercel wires static files
// itself — so this script silently no-ops there. Keeping the copy out of the
// npm build script (instead of chained shell commands) is what makes one
// build command work on both platforms.
import { cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = '/home/z/my-project'
const standalone = join(ROOT, '.next', 'standalone')

if (!existsSync(standalone)) {
  console.log('[postbuild] no .next/standalone (serverless target) — nothing to copy')
  process.exit(0)
}

cpSync(join(ROOT, '.next', 'static'), join(standalone, '.next', 'static'), { recursive: true })
cpSync(join(ROOT, 'public'), join(standalone, 'public'), { recursive: true })
console.log('[postbuild] standalone: static assets + public copied')
