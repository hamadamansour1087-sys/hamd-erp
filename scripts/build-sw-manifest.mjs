// H.A.M.D — build-time precache manifest for the service worker.
//
// WHY: the app is a single-page shell at `/` with lazily-imported views
// (POSView, DashboardView, ... are dynamic import() chunks). The SW's install
// step cannot know their content-hashed URLs, so until now only the HTML shell
// was precached — a user who went offline right after their FIRST visit (or
// right after any rebuild that changed chunk hashes) served the cached HTML but
// failed to load the JS chunks → a dead, unusable page ("لا استطيع فعل شئ").
//
// WHAT: walks .next/static (immutable, content-hashed) and writes
// public/sw-manifest.json — a flat list of same-origin URLs. sw.js reads it at
// install and precaches everything, so ONE completed online session is enough
// for full offline capability, and every rebuild re-primes caches via the
// VERSION bump + reinstall.
//
// Run AFTER `next build`, BEFORE copying public/ into .next/standalone/.
//
// PORTABILITY: all paths resolve from process.cwd() — npm/bun scripts always
// run from the package root, so this works in any checkout / CI / container.
// No machine-specific absolute paths.
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const STATIC_DIR = join(ROOT, '.next', 'static')
const OUT = join(ROOT, 'public', 'sw-manifest.json')

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

if (!existsSync(STATIC_DIR)) {
  console.error(`[sw-manifest] ${STATIC_DIR} missing — run next build first (cwd: ${ROOT})`)
  process.exit(1)
}

const urls = walk(STATIC_DIR)
  .map((p) => '/_next/static/' + relative(STATIC_DIR, p).split(sep).join('/'))
  .sort()

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: urls.length, urls }, null, 0))
console.log(`[sw-manifest] wrote ${urls.length} asset URLs (${OUT})`)
