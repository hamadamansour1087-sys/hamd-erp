/**
 * Server page wrapper.
 *
 * `export const dynamic = 'force-dynamic'` is REQUIRED for the nonce-based CSP
 * (src/proxy.ts): the per-request nonce must be stamped onto the inline
 * flight-data scripts at request time. A statically prerendered shell would
 * contain nonce-less inline scripts that a strict CSP blocks. Route segment
 * config is ignored inside 'use client' files, hence this server wrapper.
 */
import PageClient from './page-client'

export const dynamic = 'force-dynamic'

export default function Page() {
  return <PageClient />
}
