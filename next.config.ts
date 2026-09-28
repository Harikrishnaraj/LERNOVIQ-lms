import type { NextConfig } from "next";

// SECURITY.md §22. Supabase (auth/rest/storage) is same-origin from the browser's perspective
// only via NEXT_PUBLIC_SUPABASE_URL, so connect-src/img-src/media-src need the wildcard project
// host; there is no other third-party origin yet (fonts are self-hosted via next/font/local, no
// analytics/video/AI/payment provider is wired in). Revisit this list when one is (SECURITY.md
// says so explicitly).
// React's dev mode uses eval() to reconstruct cross-environment stack traces; it never does in
// production, so 'unsafe-eval' is scoped to non-production only.
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co",
  "media-src 'self' https://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions default to 1 MB. Course thumbnails may be up to 2 MB (validated in the action);
    // videos and attachments never pass through Next (signed direct-to-storage uploads).
    serverActions: { bodySizeLimit: "3mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
