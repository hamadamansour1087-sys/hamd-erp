import { clearedCookie } from '@/lib/auth'
import { NextResponse } from 'next/server'


/** POST /api/auth/logout — clear session cookie */
export async function POST() {
  const res = NextResponse.json({ data: { ok: true } })
  res.cookies.set(clearedCookie())
  return res
}
