import { db } from '@/lib/db'
import { NextRequest } from 'next/server'

/**
 * GET /api/health — unauthenticated liveness/readiness probe for load
 * balancers and monitoring. Deliberately reveals NOTHING beyond binary
 * health signals and coarse latency: no versions, no hostnames, no user
 * counts, no secrets. A failing DB check returns 503 so an unhealthy
 * instance can be pulled out of rotation.
 */
export async function GET(_req: NextRequest) {
  const t0 = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    return Response.json({
      status: 'ok',
      db: 'ok',
      dbLatencyMs: Date.now() - t0,
      time: new Date().toISOString(),
    })
  } catch {
    return Response.json(
      { status: 'degraded', db: 'error', time: new Date().toISOString() },
      { status: 503 }
    )
  }
}
