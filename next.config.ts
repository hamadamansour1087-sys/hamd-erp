import type { NextConfig } from "next";

/**
 * NOTE on script-src: Next.js App Router inlines its flight-data <script>
 * blocks, and the presence of ANY hash/nonce in script-src makes browsers
 * IGNORE 'unsafe-inline' (CSP spec) — which breaks the whole app. So the
 * inline source is 'unsafe-inline' (no hashes). XSS exposure stays low:
 * React escapes all output and no user data is rendered via
 * dangerouslySetInnerHTML. Upgrading to a nonce-based CSP through middleware
 * is a documented follow-up (see SECURITY-AUDIT.md).
 */
const csp = [
  "default-src 'self'",
  // 'unsafe-inline' for styles: Tailwind runtime + component libs inject <style> nodes;
  // Google Fonts stylesheet is used by the print templates.
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `script-src 'self' 'unsafe-inline'`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  `img-src 'self' data: blob:`,
  `media-src 'self'`,
  `connect-src 'self'`,
  `frame-src 'self'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Ignored over plain HTTP; enforced once deployed behind HTTPS.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
