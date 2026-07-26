import * as Sentry from "@sentry/nextjs";

/**
 * Client-side Sentry init (architecture.md §15). Runs before hydration
 * (node_modules/next/dist/docs/.../file-conventions/instrumentation-client.md).
 * `NEXT_PUBLIC_SENTRY_DSN` is the client-exposed counterpart of the
 * server-only `SENTRY_DSN` (config/env.ts) — Next.js only inlines
 * `NEXT_PUBLIC_*` vars into the client bundle, so the server DSN itself
 * is never shipped to the browser. Both are optional; Sentry.init with
 * an `undefined` `dsn` is a documented no-op.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
