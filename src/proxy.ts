import { NextRequest, NextResponse } from 'next/server'

/**
 * Nonce-based Content-Security-Policy (App Router pattern from the Next.js docs).
 *
 * NOTE (Next.js 16.3): this file uses the new `proxy.ts` convention — identical
 * semantics to the old `middleware.ts` (which is deprecated).
 *
 * - Production: `script-src 'self' 'nonce-<random>' 'strict-dynamic'` — no
 *   'unsafe-inline'. Next.js reads the CSP request header and automatically
 *   stamps the nonce onto its inline bootstrap/flight scripts.
 * - Development: Next dev (Turbopack HMR + eval) requires 'unsafe-eval' and
 *   inline injection, so dev keeps the relaxed policy. This is dev-only.
 *
 * `strict-dynamic` lets the nonce'd bootstrap load its own chunk scripts, so
 * nothing else needs to be allow-listed.
 *
 * Styles keep 'unsafe-inline' (Tailwind + component libraries inject <style>
 * nodes; print templates inline their CSS). Fonts stay on the Google CDN used
 * by the print templates.
 *
 * NOTE: the CSP header is intentionally NOT set by next.config.ts anymore —
 * this proxy is the single source for CSP to avoid duplicate (intersecting)
 * policies. Other security headers remain in next.config.ts.
 */
export function proxy(request: NextRequest) {
  // REQUEST CORRELATION ID (observability floor): every request — pages AND
  // api — gets a stable id (honours an upstream load-balancer's header when
  // present). Logged as one structured line WITHOUT query strings (queries
  // can carry search terms; never tokens/passwords — those live in bodies).
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
  console.log(
    JSON.stringify({
      t: new Date().toISOString(),
      lvl: 'info',
      msg: 'request',
      id: requestId,
      m: request.method,
      p: request.nextUrl.pathname,
    })
  )

  // Edge-runtime safe (Vercel middleware has NO Node `Buffer`): btoa exists in
  // both Edge and Node ≥16. Encoding a v4 UUID keeps the same 122 bits of
  // entropy the previous Buffer base64 produced — nonce uniqueness unchanged.
  const nonce = btoa(crypto.randomUUID())

  const isDev = process.env.NODE_ENV !== 'production'
  const scriptSrc = isDev
    ? `'self' 'unsafe-eval' 'unsafe-inline'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`

  const csp = [
    `default-src 'self'`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `script-src ${scriptSrc}`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `img-src 'self' data: blob:`,
    `media-src 'self'`,
    `connect-src 'self'`,
    `worker-src 'self'`,
    `frame-src 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('x-request-id', requestId)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('x-request-id', requestId)
  return response
}

export const config = {
  // Include /api (request-id + correlation log) but skip immutable static
  // assets. CSP itself is harmless on JSON responses.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
