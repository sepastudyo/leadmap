import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {};

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
