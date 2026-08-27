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
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

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
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  // Skip API routes (JSON — no CSP needed) and immutable static assets.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
