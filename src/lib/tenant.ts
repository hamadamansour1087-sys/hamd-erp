/**
 * Tenant lifecycle — single source of truth for subscription status rules.
 *
 * Statuses (Org.status):
 *  - PENDING   : freshly registered, awaiting company approval → NO access.
 *  - TRIAL     : approved, free trial until trialEndsAt → capped access.
 *  - ACTIVE    : paying / grandfathered tenant → full access.
 *  - SUSPENDED : platform-admin blocked → NO access.
 *
 * Enforcement points:
 *  - lib/auth.getSession refuses a session whose org is not accessible → every
 *    authenticated API route is covered by construction (no per-route gaps).
 *  - POST /api/auth/login maps the same rules to specific error codes so the
 *    UI can explain WHY the user cannot enter (pending/suspended/expired).
 *  - Trial usage caps are enforced inside the write routes (products/invoices).
 */

export type OrgStatus = 'PENDING' | 'TRIAL' | 'ACTIVE' | 'SUSPENDED'

export const ORG_STATUSES: readonly OrgStatus[] = ['PENDING', 'TRIAL', 'ACTIVE', 'SUSPENDED']

/** Free-trial length granted at approval (days). */
export const TRIAL_DAYS = 14

/** Trial usage caps — the "restrictions" during the free period. */
export const TRIAL_MAX_PRODUCTS = 50
export const TRIAL_MAX_INVOICES = 100

export interface OrgAccessShape {
  status?: string | null
  trialEndsAt?: Date | string | null
}

export type AccessCode = 'org-pending' | 'org-suspended' | 'org-trial-expired'

export interface AccessState {
  ok: boolean
  code?: AccessCode
}

/**
 * Normalise an unknown stored status. Anything unrecognised (incl. NULL from
 * legacy rows) is treated as ACTIVE — fail-open for data, fail-closed for
 * lifecycle transitions happens at the write side (register creates PENDING).
 */
export function normalizeStatus(raw: string | null | undefined): OrgStatus {
  return ORG_STATUSES.includes(raw as OrgStatus) ? (raw as OrgStatus) : 'ACTIVE'
}

/** Trial window expired? Only meaningful for TRIAL orgs. */
export function trialExpired(trialEndsAt: Date | string | null | undefined): boolean {
  if (!trialEndsAt) return true // TRIAL without an anchor is treated as over
  const end = typeof trialEndsAt === 'string' ? new Date(trialEndsAt) : trialEndsAt
  return end.getTime() <= Date.now()
}

/**
 * Central access rule. PENDING/SUSPENDED/expired-TRIAL orgs get NO access —
 * the server refuses both the session and the login, so the client cannot
 * reach a single business record in any state the company has not approved.
 */
export function accessState(org: OrgAccessShape | null | undefined): AccessState {
  if (!org) return { ok: false, code: 'org-pending' }
  const status = normalizeStatus(org.status)
  switch (status) {
    case 'ACTIVE':
      return { ok: true }
    case 'TRIAL':
      return trialExpired(org.trialEndsAt) ? { ok: false, code: 'org-trial-expired' } : { ok: true }
    case 'PENDING':
      return { ok: false, code: 'org-pending' }
    case 'SUSPENDED':
      return { ok: false, code: 'org-suspended' }
  }
}

/** Whole days left in the trial window (ceil, min 0) — for UI banners. */
export function trialDaysLeft(trialEndsAt: Date | string | null | undefined): number {
  if (!trialEndsAt) return 0
  const end = typeof trialEndsAt === 'string' ? new Date(trialEndsAt) : trialEndsAt
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000))
}
