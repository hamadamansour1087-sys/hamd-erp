// H.A.M.D — post-build step for SELF-HOSTED / standalone runs ONLY.
//
// `next build` with output:"standalone" produces .next/standalone WITHOUT the
// static assets and public/ (they are expected to be copied next to the
// server). On VERCEL this directory does not exist — Vercel wires static files
// itself — so this script cleanly no-ops there. Keeping the copy out of the
// npm build script (instead of chained shell commands) is what makes one
// build command work on both platforms.
//
// PORTABILITY: every path resolves from process.cwd() — npm/bun scripts run
// from the package root, so the same command works in any checkout, CI job or
// container. No machine-specific absolute paths anywhere.
//
// LAYOUT-AWARE: Next.js mirrors the project's path under .next/standalone
// relative to the workspace root it detects (nearest parent lockfile). A flat
// project has server.js directly in .next/standalone/, while a project nested
// under a parent workspace (e.g. a clone inside another checkout) has it at
// .next/standalone/<relative-path>/. We locate the real app root via server.js
// and copy assets THERE — not blindly into the standalone top level.
//
// HONESTY: when .next/standalone EXISTS the copy is MANDATORY — the script
// verifies the copied trees are non-empty and exits non-zero on any failure,
// instead of printing a misleading "nothing to copy" while producing a broken
// standalone bundle.
import { cpSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const standalone = join(ROOT, '.next', 'standalone')
const staticDir = join(ROOT, '.next', 'static')
const publicDir = join(ROOT, 'public')

if (!existsSync(standalone)) {
  console.log(
    '[postbuild] no .next/standalone here → serverless target (e.g. Vercel): static wiring is handled by the platform, nothing to copy',
  )
  process.exit(0)
}

// Standalone build detected → the sources MUST exist; a silent success here
// would ship a standalone bundle with no JS/CSS at all.
for (const dir of [staticDir, publicDir]) {
  if (!existsSync(dir)) {
    console.error(`[postbuild] FATAL: ${dir} is missing but .next/standalone exists — run the full build (next build) first`)
    process.exit(1)
  }
}

// Locate the actual standalone app root (the directory holding server.js),
// skipping node_modules and Next's own .next subtree.
function findAppRoot(dir, depth) {
  if (depth > 6) return null
  if (existsSync(join(dir, 'server.js'))) return dir
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name === 'node_modules' || entry.name === '.next') continue
    const found = findAppRoot(join(dir, entry.name), depth + 1)
    if (found) return found
  }
  return null
}

const appRoot = findAppRoot(standalone, 0)
if (!appRoot) {
  console.error('[postbuild] FATAL: .next/standalone exists but no server.js was found inside it — broken standalone build')
  process.exit(1)
}

cpSync(staticDir, join(appRoot, '.next', 'static'), { recursive: true })
cpSync(publicDir, join(appRoot, 'public'), { recursive: true })

// Verify the copy actually landed: non-empty trees next to server.js.
const copiedStatic = readdirSync(join(appRoot, '.next', 'static')).length
const copiedPublic = readdirSync(join(appRoot, 'public')).length
if (copiedStatic === 0 || copiedPublic === 0) {
  console.error(`[postbuild] FATAL: copy claimed success but standalone trees are empty (static=${copiedStatic}, public=${copiedPublic})`)
  process.exit(1)
}

const rel = appRoot === standalone ? '.next/standalone' : '.next/standalone/' + appRoot.slice(standalone.length + 1)
console.log(
  `[postbuild] standalone verified: .next/static (${copiedStatic} entries) + public/ (${copiedPublic} entries) copied into ${rel}` +
    (appRoot === standalone ? '' : ' [nested workspace layout detected]'),
)
