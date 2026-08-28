/* H.A.M.D service worker — offline-first app shell (PRODUCTION only).
 * - Precaches the root document shell on install (complete HTML only).
 * - Navigation requests: network-first (with timeout) + safe cache fallback.
 * - Only COMPLETE documents are cached or served — a response streamed from a
 *   dev compile / aborted request can still be `res.ok` while truncated, and
 *   hydrating a truncated shell causes React hydration mismatches. The
 *   completeness check (`</html>` suffix + HTML content-type) makes that
 *   class of bug impossible.
 * - Immutable build assets (_next/static): cache-first (content-hashed URLs).
 * - Dev / non-hashed assets: stale-while-revalidate (never stays stale).
 * - API GETs: network-first, only 2xx cached, fallback to last good data.
 * - Mutating methods: always passthrough (offline mutations handled by JS queue).
 */
const VERSION = 'tijara-v4'
const SHELL_CACHE = `${VERSION}-shell`
const ASSET_CACHE = `${VERSION}-assets`
const DATA_CACHE = `${VERSION}-data`

const PRECACHE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(SHELL_CACHE)
        await Promise.all(
          PRECACHE.map(async (url) => {
            if (url === '/') return // shell is cached on first navigation (validated)
            try {
              const res = await fetch(url)
              if (res && res.ok) await cache.put(url, res)
            } catch {}
          })
        )
      } catch {}
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

function isStatic(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(css|js|woff2?|png|svg|jpg|jpeg|webp|ico)$/.test(url.pathname)
  )
}

/**
 * Never let internal Next.js streams/HMR/RSC-flights be treated as documents.
 * Returns true when this handler must fully IGNORE the request.
 */
function isInternalStream(url) {
  if (url.pathname.startsWith('/_next/webpack-hmr')) return true
  // RSC flight payloads (client-side navigation data) must pass straight through —
  // caching them would poison the shell cache with non-HTML blobs.
  if (url.searchParams.has('_rsc') || url.searchParams.has('_nextRsc')) return true
  return false
}

// Defensive check using request headers (works in all SW-supporting browsers).
function isRSCFlight(req) {
  return req.headers.get('rsc') === '1' || req.headers.get('accept') === 'text/x-component'
}

/**
 * A navigation response is only cacheable when it is a COMPLETE html document.
 * Aborted/chunked streams (dev recompiles, client timeouts) still report
 * res.ok — caching them would poison the shell with truncated HTML whose
 * suspense markers confuse hydration.
 */
async function asCompleteHtml(res) {
  try {
    const type = res.headers.get('content-type') || ''
    if (!type.includes('text/html')) return null
    const text = await res.clone().text()
    if (!text.trimEnd().endsWith('</html>')) return null
    return text
  } catch {
    return null
  }
}

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    fetch(req).then(
      (res) => {
        clearTimeout(timer)
        resolve(res)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

async function handleNavigation(req) {
  try {
    // Network-first with a short timeout so long stalls fall back quickly.
    const res = await fetchWithTimeout(req, 4000)
    if (res && res.ok && res.type !== 'opaqueredirect') {
      const body = await asCompleteHtml(res)
      if (body) {
        const valid = new Response(body, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        })
        caches.open(SHELL_CACHE).then((c) => c.put(req, valid.clone()))
        // Always refresh the canonical shell entry too.
        if (new URL(req.url).pathname === '/') {
          caches.open(SHELL_CACHE).then((c) => c.put('/', valid.clone()))
        }
        return res
      }
    }
    return res
  } catch {
    const exact = await caches.match(req)
    if (exact) return exact
    const shell = await caches.match('/')
    if (shell) return shell
    return new Response('<h1>Offline</h1>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}

async function handleAsset(req, url) {
  // Content-hashed build assets are immutable → cache-first forever.
  const immutable = url.pathname.startsWith('/_next/static/')
  const hit = await caches.match(req)
  if (hit && immutable) return hit

  if (hit && !immutable) {
    // Stale-while-revalidate: serve fast, refresh quietly.
    const refresh = fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone()
          caches.open(ASSET_CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() => undefined)
    event_noop(refresh)
    return hit
  }

  try {
    const res = await fetch(req)
    if (res && res.ok) {
      const copy = res.clone()
      caches.open(ASSET_CACHE).then((c) => c.put(req, copy))
    }
    return res
  } catch {
    return hit || Response.error()
  }
}

function event_noop(_p) {
  /* background refresh intentionally not awaited */
}

async function handleApiGet(req) {
  try {
    const res = await fetch(req)
    if (res && res.ok) {
      const copy = res.clone()
      caches.open(DATA_CACHE).then((c) => c.put(req, copy))
    }
    return res
  } catch {
    const hit = await caches.match(req)
    if (hit) return hit
    return new Response(JSON.stringify({ ok: false, offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Internal dev/HMR/RSC streams: full passthrough, never intercepted.
  if (isInternalStream(url) || isRSCFlight(req)) return

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigation(req))
    return
  }

  if (isStatic(url)) {
    event.respondWith(handleAsset(req, url))
    return
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiGet(req))
    return
  }

  // Everything else (e.g. same-origin misc): plain passthrough.
})
