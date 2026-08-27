/**
 * Next.js instrumentation hook — runs once when the server process boots.
 * Production must refuse to start without a strong AUTH_SECRET (fail-fast,
 * not lazily on the first auth request).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getAuthSecret } = await import('@/lib/auth')
    getAuthSecret() // throws in production when AUTH_SECRET is missing/weak
  }
}
