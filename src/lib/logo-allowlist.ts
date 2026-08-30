/**
 * logo-allowlist.ts — SINGLE SOURCE for the logo data-URL policy.
 *
 * Imported by BOTH sides of the R3-1 parity pair:
 *   - server WRITE path: settings/org PUT (what may be STORED in Org.logo)
 *   - client READ path:  report-pdf.ts toDataUrl (what may be RENDERED in the
 *     generated PDF's <img src>)
 *
 * History: the write path used to validate the PREFIX only
 * (`^data:image/(png|jpeg|webp|gif);base64,` with no end anchor), so a
 * breakout-shaped value like
 *     data:image/png;base64,AAAA" onerror="alert(1)
 * passed server-side validation and was STORED. No exploit existed (the PDF
 * read path was strict and the print template escapes the attribute), but
 * every future consumer had to re-derive the strictness forever. Now the
 * same strict rule guards the write itself: raster formats only, mandatory
 * base64 payload, and a charset test that makes quotes/spaces/angle brackets
 * IMPOSSIBLE — the returned URL can never escape an HTML attribute.
 *
 * Zero imports on purpose: this module must stay dependency-free so the
 * client bundle (report-pdf) can share it without pulling server code.
 */

/** Hard cap matching settings/org PUT (600KB base64 ≈ 450KB binary). */
export const LOGO_MAX_LENGTH = 600_000

/**
 * Strict data-URL allowlist: `data:image/<raster>;base64,<payload>` where the
 * payload is base64 charset ONLY (no quotes, spaces, `<`, `>`, `;` beyond the
 * mandatory prefix). Anchored on both ends.
 */
export const LOGO_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/

/** True when `url` may be stored AND rendered as an org logo. */
export function isValidLogoDataUrl(url: string | null | undefined): boolean {
  if (!url || url.length > LOGO_MAX_LENGTH) return false
  return LOGO_DATA_URL_RE.test(url)
}
