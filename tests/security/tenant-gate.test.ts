/**
 * TENANT LIFECYCLE GATE — regression suite (bun:test) for the subscription
 * control feature:
 *
 *  - Registration NO LONGER grants access: the org is created PENDING, the
 *    response carries NO session cookie, and login is refused with a specific
 *    code (403 org-pending) even with perfectly valid credentials.
 *  - The central session gate (lib/auth.getSession) refuses ANY authenticated
 *    route for a non-accessible org → verified through /api/bootstrap (401).
 *  - The platform console API (/api/platform/orgs*) is SUPERADMIN-only:
 *    tenant roles get 403. Approve transitions PENDING → TRIAL with a
 *    trialEndsAt window ≈ now + days; activate/suspend/delete work as named.
 *  - Trial usage caps ("القيود"): a TRIAL org is capped at
 *    TRIAL_MAX_PRODUCTS products and TRIAL_MAX_INVOICES sale invoices
 *    (403 trial-limit-*); ACTIVE orgs are uncapped.
 *  - Expired trial (403 org-trial-expired) and suspension (403
 *    org-suspended) are refused at login AND at the session gate.
 *  - The platform org cannot be suspended/deleted/downgraded by its own
 *    super-admin (400 cannot-touch-platform-org).
 *
 * Run: bun test tests/security/tenant-gate.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { setupPgTestDatabase } from './pg-setup'

// own database: bun runs test files in parallel
const TEST_DB_NAME = 'hamd_test_tenant'

process.env.DATABASE_URL = `postgresql://hamd@127.0.0.1:5432/${TEST_DB_NAME}?connection_limit=10`
process.env.AUTH_SECRET = 'test-secret-value-at-least-16-chars-long'
process.env.NODE_ENV = 'test'

// Dynamic imports AFTER env is set (PrismaClient reads DATABASE_URL at import time)
const { db } = await import('@/lib/db')
const auth = await import('@/lib/auth')
const registerRoute = await import('@/app/api/auth/register/route')
const loginRoute = await import('@/app/api/auth/login/route')
const bootstrapRoute = await import('@/app/api/bootstrap/route')
const platformOrgsRoute = await import('@/app/api/platform/orgs/route')
const platformOrgActionsRoute = await import('@/app/api/platform/orgs/[id]/route')
const productsRoute = await import('@/app/api/products/route')
const invoicesRoute = await import('@/app/api/invoices/route')
const tenant = await import('@/lib/tenant')

const { NextRequest } = await import('next/server')

type Sess = { id: string; orgId: string; role: string; tokenVersion?: number }

function makeReq(
  url: string,
  opts: {
    method?: string
    body?: unknown
    session?: Sess
    headers?: Record<string, string>
  } = {}
): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json', ...(opts.headers || {}) })
  if (opts.session) {
    const token = auth.createToken(opts.session.id, opts.session.tokenVersion ?? 0)
    headers.set('cookie', `session=${token}`)
  }
  return new NextRequest(`http://localhost${url}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
}

const json = async (res: Response) => {
  const j = await res.json().catch(() => ({}))
  return { status: res.status, json: j, setCookie: res.headers.get('set-cookie') }
}

const REG = { orgName: 'عيادة التحقق', name: 'مالك الطلب', email: 'pending-owner@test.io', phone: '01012345678', password: 'secret-123' }

let platformOrg: { id: string }
let superAdmin: { id: string; tokenVersion: number }
// a NORMAL active tenant (the "cross-tenant prying" subject for console authz)
let tenantOrg: { id: string }
let tenantAdmin: { id: string; tokenVersion: number }
let pendingOrgId = ''
let pendingUserId = ''

beforeAll(async () => {
  setupPgTestDatabase(TEST_DB_NAME)

  // platform (company) org + SUPERADMIN staff account
  platformOrg = await db.org.create({ data: { name: 'H.A.M.D — إدارة النظام' } })
  superAdmin = await db.user.create({
    data: {
      orgId: platformOrg.id,
      email: 'owner@platform.test',
      name: 'Platform',
      passwordHash: auth.hashPassword('platform-pass-1'),
      role: 'SUPERADMIN',
    },
  })

  // a regular ACTIVE tenant admin (must be forbidden from the console)
  tenantOrg = await db.org.create({ data: { name: 'Tenant Org' } })
  tenantAdmin = await db.user.create({
    data: {
      orgId: tenantOrg.id,
      email: 'admin@tenant.test',
      name: 'Tenant Admin',
      passwordHash: auth.hashPassword('tenant-pass-1'),
      role: 'ADMIN',
    },
  })
})

afterAll(async () => {
  await db.$disconnect()
})

const superSess = () => ({ id: superAdmin.id, orgId: platformOrg.id, role: 'SUPERADMIN' }) as Sess

// ─────────── 1. registration creates a PENDING request, NOT a session ───────────

describe('REGISTER — submits an approval request, no auto-access', () => {
  test('201 + pending:true + NO set-cookie', async () => {
    const res = await registerRoute.POST(makeReq('/api/auth/register', { method: 'POST', body: REG }))
    const { status, json: j, setCookie } = await json(res)
    expect(status).toBe(201)
    expect(j.data.pending).toBe(true)
    expect(j.data.trialDays).toBe(tenant.TRIAL_DAYS)
    expect(setCookie).toBeNull() // the critical regression: no auto-login
  })

  test('org stored as PENDING with null trial window + starter data created', async () => {
    const user = await db.user.findUnique({
      where: { email: REG.email },
      include: { org: { include: { warehouses: true } } },
    })
    expect(user).not.toBeNull()
    expect(user!.org.status).toBe('PENDING')
    expect(user!.org.trialEndsAt).toBeNull()
    expect(user!.org.warehouses.length).toBe(1) // starter warehouse ready for approval
    pendingOrgId = user!.org.id
    pendingUserId = user!.id
  })

  test('duplicate email still 409', async () => {
    const res = await registerRoute.POST(makeReq('/api/auth/register', { method: 'POST', body: REG }))
    expect(res.status).toBe(409)
  })
})

// ─────────── 2. PENDING org cannot log in or use ANY authenticated route ───────────

describe('PENDING GATE — zero access before approval', () => {
  test('login with valid credentials → 403 org-pending (not 401 invalid)', async () => {
    const res = await loginRoute.POST(
      makeReq('/api/auth/login', { method: 'POST', body: { email: REG.email, password: REG.password } })
    )
    const { status, json: j } = await json(res)
    expect(status).toBe(403)
    expect(j.error).toBe('org-pending')
    expect(j.data).toBeUndefined()
  })

  test('valid token for a pending user → bootstrap 401 (central session gate)', async () => {
    const sess = { id: pendingUserId, orgId: pendingOrgId, role: 'ADMIN' } as Sess
    const res = await bootstrapRoute.GET(makeReq('/api/bootstrap', { session: sess }))
    expect(res.status).toBe(401)
  })

  test('business routes are equally refused (products GET → 401)', async () => {
    const sess = { id: pendingUserId, orgId: pendingOrgId, role: 'ADMIN' } as Sess
    const res = await productsRoute.GET(makeReq('/api/products', { session: sess }))
    expect(res.status).toBe(401)
  })
})

// ─────────── 3. platform console — authorization + approve flow ───────────

describe('PLATFORM CONSOLE — SUPERADMIN only, approve → TRIAL', () => {
  test('tenant ADMIN is forbidden from the console', async () => {
    const sess = { id: tenantAdmin.id, orgId: tenantOrg.id, role: 'ADMIN' } as Sess
    const res = await platformOrgsRoute.GET(makeReq('/api/platform/orgs', { session: sess }))
    expect(res.status).toBe(403)
  })

  test('tenant ADMIN is forbidden from lifecycle actions too', async () => {
    const sess = { id: tenantAdmin.id, orgId: tenantOrg.id, role: 'ADMIN' } as Sess
    const res = await platformOrgActionsRoute.POST(
      makeReq(`/api/platform/orgs/${tenantOrg.id}`, { method: 'POST', session: sess, body: { action: 'activate' } }),
      { params: Promise.resolve({ id: tenantOrg.id }) }
    )
    expect(res.status).toBe(403)
  })

  test('unauthenticated → 401', async () => {
    const res = await platformOrgsRoute.GET(makeReq('/api/platform/orgs'))
    expect(res.status).toBe(401)
  })

  test('SUPERADMIN sees stats + pending queue with owner contact info', async () => {
    const res = await platformOrgsRoute.GET(makeReq('/api/platform/orgs', { session: superSess() }))
    const { status, json: j } = await json(res)
    expect(status).toBe(200)
    expect(j.data.stats.pending).toBe(1)
    const row = j.data.orgs.find((o: { id: string }) => o.id === pendingOrgId)
    expect(row.status).toBe('PENDING')
    expect(row.ownerEmail).toBe(REG.email)
    expect(row.phone).toBe(REG.phone)
  })

  test('approve: PENDING → TRIAL with trialEndsAt ≈ now + TRIAL_DAYS', async () => {
    const before = Date.now()
    const res = await platformOrgActionsRoute.POST(
      makeReq(`/api/platform/orgs/${pendingOrgId}`, { method: 'POST', session: superSess(), body: { action: 'approve' } }),
      { params: Promise.resolve({ id: pendingOrgId }) }
    )
    const { status, json: j } = await json(res)
    expect(status).toBe(200)
    expect(j.data.status).toBe('TRIAL')
    const end = new Date(j.data.trialEndsAt).getTime()
    const expected = before + tenant.TRIAL_DAYS * 86_400_000
    // generous window: route execution + clock skew
    expect(Math.abs(end - expected)).toBeLessThan(60_000)
  })

  test('approved tenant logs in → 200 + session + org.status TRIAL in payload', async () => {
    const res = await loginRoute.POST(
      makeReq('/api/auth/login', { method: 'POST', body: { email: REG.email, password: REG.password } })
    )
    const { status, json: j, setCookie } = await json(res)
    expect(status).toBe(200)
    expect(setCookie).toContain('session=')
    expect(j.data.org.status).toBe('TRIAL')
    expect(j.data.org.trialEndsAt).not.toBeNull()
  })

  test('bootstrap now works for the approved tenant (session gate re-opens)', async () => {
    const sess = { id: pendingUserId, orgId: pendingOrgId, role: 'ADMIN' } as Sess
    const res = await bootstrapRoute.GET(makeReq('/api/bootstrap', { session: sess }))
    expect(res.status).toBe(200)
  })
})

// ─────────── 4. trial usage caps ───────────

describe('TRIAL CAPS — restricted usage during the free window', () => {
  const trialSess = () => ({ id: pendingUserId, orgId: pendingOrgId, role: 'ADMIN' }) as Sess

  test(`product creation is capped at TRIAL_MAX_PRODUCTS (${tenant.TRIAL_MAX_PRODUCTS})`, async () => {
    await db.product.createMany({
      data: Array.from({ length: tenant.TRIAL_MAX_PRODUCTS }, (_, i) => ({
        orgId: pendingOrgId,
        name: `صنف تجربة ${i + 1}`,
      })),
    })
    const res = await productsRoute.POST(
      makeReq('/api/products', { method: 'POST', session: trialSess(), body: { name: 'الصنف ٥١' } })
    )
    const { status, json: j } = await json(res)
    expect(status).toBe(403)
    expect(j.error).toBe('trial-limit-products')
  })

  test(`sale invoices are capped at TRIAL_MAX_INVOICES (${tenant.TRIAL_MAX_INVOICES})`, async () => {
    await db.invoice.createMany({
      data: Array.from({ length: tenant.TRIAL_MAX_INVOICES }, (_, i) => ({
        orgId: pendingOrgId,
        number: i + 1,
        type: 'SALE',
      })),
    })
    const res = await invoicesRoute.POST(
      makeReq('/api/invoices', {
        method: 'POST',
        session: trialSess(),
        body: { type: 'SALE', items: [{ productId: 'any', qty: 1 }] },
      })
    )
    const { status, json: j } = await json(res)
    expect(status).toBe(403)
    expect(j.error).toBe('trial-limit-invoices')
  })

  test('cap check fires BEFORE item validation (no data leak on the error path)', async () => {
    const res = await invoicesRoute.POST(
      makeReq('/api/invoices', {
        method: 'POST',
        session: trialSess(),
        body: { type: 'SALE', items: [] }, // would be 400 items-required if uncapped
      })
    )
    expect(res.status).toBe(403)
  })
})

// ─────────── 5. expiry + suspension + activation ───────────

describe('EXPIRY / SUSPEND / ACTIVATE — full lifecycle', () => {
  const trialSess = () => ({ id: pendingUserId, orgId: pendingOrgId, role: 'ADMIN' }) as Sess

  test('expired trial → login 403 org-trial-expired AND bootstrap 401', async () => {
    await db.org.update({
      where: { id: pendingOrgId },
      data: { trialEndsAt: new Date(Date.now() - 86_400_000) },
    })
    const login = await loginRoute.POST(
      makeReq('/api/auth/login', { method: 'POST', body: { email: REG.email, password: REG.password } })
    )
    expect(login.status).toBe(403)
    expect((await login.json()).error).toBe('org-trial-expired')

    const boot = await bootstrapRoute.GET(makeReq('/api/bootstrap', { session: trialSess() }))
    expect(boot.status).toBe(401)
  })

  test('suspend → login 403 org-suspended', async () => {
    await db.org.update({ where: { id: pendingOrgId }, data: { status: 'SUSPENDED' } })
    const login = await loginRoute.POST(
      makeReq('/api/auth/login', { method: 'POST', body: { email: REG.email, password: REG.password } })
    )
    expect(login.status).toBe(403)
    expect((await login.json()).error).toBe('org-suspended')
  })

  test('activate (paid) → login 200, caps lifted, products POST succeeds', async () => {
    const res = await platformOrgActionsRoute.POST(
      makeReq(`/api/platform/orgs/${pendingOrgId}`, { method: 'POST', session: superSess(), body: { action: 'activate' } }),
      { params: Promise.resolve({ id: pendingOrgId }) }
    )
    expect(res.status).toBe(200)

    const login = await loginRoute.POST(
      makeReq('/api/auth/login', { method: 'POST', body: { email: REG.email, password: REG.password } })
    )
    expect(login.status).toBe(200)
    expect((await login.json()).data.org.status).toBe('ACTIVE')

    // uncapped once ACTIVE: the previous 51st product now goes through
    const created = await productsRoute.POST(
      makeReq('/api/products', { method: 'POST', session: trialSess(), body: { name: 'صنف بعد التفعيل' } })
    )
    expect(created.status).toBe(200)
  })
})

// ─────────── 6. platform org self-protection + delete ───────────

describe('PLATFORM ORG PROTECTION', () => {
  test('super-admin cannot suspend or delete their own platform org', async () => {
    for (const action of ['suspend', 'delete', 'trial'] as const) {
      const res = await platformOrgActionsRoute.POST(
        makeReq(`/api/platform/orgs/${platformOrg.id}`, { method: 'POST', session: superSess(), body: { action } }),
        { params: Promise.resolve({ id: platformOrg.id }) }
      )
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('cannot-touch-platform-org')
    }
  })

  test('rejecting a registration = delete cascades the whole tenant', async () => {
    // a fresh pending request
    await registerRoute.POST(
      makeReq('/api/auth/register', {
        method: 'POST',
        body: { ...REG, email: 'reject-me@test.io' },
      })
    )
    const u = await db.user.findUnique({ where: { email: 'reject-me@test.io' }, select: { orgId: true } })
    expect(u).not.toBeNull()

    const res = await platformOrgActionsRoute.POST(
      makeReq(`/api/platform/orgs/${u!.orgId}`, { method: 'POST', session: superSess(), body: { action: 'delete' } }),
      { params: Promise.resolve({ id: u!.orgId }) }
    )
    expect(res.status).toBe(200)

    const orgGone = await db.org.findUnique({ where: { id: u!.orgId } })
    const userGone = await db.user.findUnique({ where: { email: 'reject-me@test.io' } })
    expect(orgGone).toBeNull()
    expect(userGone).toBeNull()
  })

  test('unknown action → 400, unknown org → 404', async () => {
    const bad = await platformOrgActionsRoute.POST(
      makeReq(`/api/platform/orgs/${pendingOrgId}`, { method: 'POST', session: superSess(), body: { action: 'promote' } }),
      { params: Promise.resolve({ id: pendingOrgId }) }
    )
    expect(bad.status).toBe(400)

    const missing = await platformOrgActionsRoute.POST(
      makeReq('/api/platform/orgs/does-not-exist', { method: 'POST', session: superSess(), body: { action: 'activate' } }),
      { params: Promise.resolve({ id: 'does-not-exist' }) }
    )
    expect(missing.status).toBe(404)
  })
})

// ─────────── 7. shared rule unit pins ───────────

describe('tenant.ts unit pins', () => {
  test('accessState truth table', () => {
    expect(tenant.accessState({ status: 'ACTIVE' }).ok).toBe(true)
    expect(tenant.accessState({ status: 'TRIAL', trialEndsAt: new Date(Date.now() + 86_400_000) }).ok).toBe(true)
    expect(tenant.accessState({ status: 'TRIAL', trialEndsAt: new Date(Date.now() - 1000) }).code).toBe('org-trial-expired')
    expect(tenant.accessState({ status: 'PENDING' }).code).toBe('org-pending')
    expect(tenant.accessState({ status: 'SUSPENDED' }).code).toBe('org-suspended')
    expect(tenant.accessState(null).ok).toBe(false)
  })

  test('normalizeStatus fails open for legacy/null rows', () => {
    expect(tenant.normalizeStatus(null)).toBe('ACTIVE')
    expect(tenant.normalizeStatus('garbage')).toBe('ACTIVE')
    expect(tenant.normalizeStatus('PENDING')).toBe('PENDING')
  })

  test('trialDaysLeft counts whole days up (ceil)', () => {
    const in36h = new Date(Date.now() + 36 * 3600_000)
    expect(tenant.trialDaysLeft(in36h)).toBe(2)
    expect(tenant.trialDaysLeft(null)).toBe(0)
  })
})
