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
    ];
  },
};

export default nextConfig;
