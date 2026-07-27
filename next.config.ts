import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Security headers (architecture.md §13.5 "XSS: React auto-escaping +
 * strict CSP"; "Security misconfig / logging: hardened security
 * headers"; sprint-6.md Sprint 6 deliverable "CSP"). Previously absent
 * entirely — Phase 6.5 closes this gap.
 *
 * Uses Next.js's documented no-nonce `headers()` pattern
 * (node_modules/next/dist/docs/.../content-security-policy.md) rather
 * than the nonce-based alternative: nonces require converting every
 * page to dynamic rendering (disabling static optimization/ISR site-
 * wide), which is a much larger change than this phase's single-issue
 * scope. `'unsafe-inline'` for style/script is the documented no-nonce
 * baseline's own tradeoff, not an oversight.
 *
 * Allowlisted origins beyond `'self'`, kept to exactly what this app's
 * code calls:
 * - `https://maps.googleapis.com` (script-src): the Maps JavaScript API
 *   loader (`components/discovery/map-view.tsx`, architecture.md §7.1).
 * - `https://maps.googleapis.com`, `https://maps.gstatic.com`,
 *   `https://maps.google.com` (img-src): map tiles and the marker icon
 *   URL used directly in `map-view.tsx`.
 * - `https://*.sentry.io`, `https://*.ingest.sentry.io` (connect-src):
 *   client-side error reporting (`instrumentation-client.ts`,
 *   architecture.md §15). Wildcarded since the exact ingest host is
 *   project-specific and comes from `NEXT_PUBLIC_SENTRY_DSN`, unset in
 *   this environment.
 */
const isDev = process.env.NODE_ENV === "development";
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://maps.googleapis.com${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://maps.googleapis.com https://maps.gstatic.com https://maps.google.com;
  font-src 'self';
  connect-src 'self' https://maps.googleapis.com https://*.sentry.io https://*.ingest.sentry.io;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

/**
 * Sentry error monitoring (architecture.md §15). `org`/`project`/
 * `authToken` are read from the SENTRY_ORG/SENTRY_PROJECT/
 * SENTRY_AUTH_TOKEN env vars by the plugin itself — unset in local dev,
 * so this build-time step (source-map upload, route-manifest injection)
 * silently no-ops rather than failing the build (architecture.md §15
 * "no cron, no background functions" doesn't apply here, but the same
 * "never break the build for missing optional config" principle does).
 */
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  widenClientFileUpload: true,
  telemetry: false,
});
