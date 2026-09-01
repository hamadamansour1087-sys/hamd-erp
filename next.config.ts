import type { NextConfig } from "next";

/**
 * Security headers (excluding CSP — that is set by src/middleware.ts with a
 * per-request nonce; keeping CSP here would create a duplicate intersecting
 * policy that defeats the nonce).
 */
const securityHeaders = [
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
  // Allow the sandbox preview host to load dev-only resources (dev mode only).
  allowedDevOrigins: ["preview-chat-bbe12448-2e35-4d17-981f-1eee33355621.space-z.ai"],
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Tutorial videos (10-14 files, ~5-10MB each): served from public/, so
      // Vercel's default is `max-age=0, must-revalidate` — every revisit
      // revalidates ALL of them before playing. A 1-day browser cache with a
      // week-long SWR window keeps repeat plays instant while capping staleness
      // (videos are updated rarely; 24h worst-case delay is acceptable).
      {
        source: "/videos/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
          { key: "Accept-Ranges", value: "bytes" },
        ],
      },
      // App icons are referenced by fixed paths in the manifest + layout —
      // effectively immutable, cache for a year.
      {
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
