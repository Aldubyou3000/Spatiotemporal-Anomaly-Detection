import type { NextConfig } from "next";

// Security headers for the dashboard. Tokens are httpOnly (JS can't read them),
// but a CSP is the standard second layer: it limits where scripts/connections
// can go, so an injected script can't exfiltrate to an attacker origin.
//
// CSP notes:
//  - 'unsafe-inline' for style-src: Next.js / Turbopack inject inline styles for
//    hydration and the app uses inline style objects heavily. Nonce-based CSP is
//    not cleanly supported with the current Turbopack setup, so styles stay
//    inline-permitted. Scripts are NOT given 'unsafe-eval' in production.
//  - connect-src must include the API origin (NEXT_PUBLIC_API_URL) so fetch/SSE
//    to FastAPI works; falls back to localhost for dev.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // Dev needs 'unsafe-eval' for React Fast Refresh / Turbopack HMR; prod does not.
  `script-src 'self'${isDev ? " 'unsafe-eval' 'unsafe-inline'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // API (REST + SSE) + Supabase storage for any signed image URLs. ws: for HMR in dev.
  `connect-src 'self' ${API_URL} https://*.supabase.co${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
