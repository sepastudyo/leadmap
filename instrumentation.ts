import * as Sentry from "@sentry/nextjs";

import { env } from "@/config/env";

/**
 * Server/edge Sentry init (architecture.md §15 "Sentry error monitoring
 * wired in"). Runs once per server instance
 * (node_modules/next/dist/docs/.../file-conventions/instrumentation.md).
 * `SENTRY_DSN` is optional (config/env.ts) — Sentry.init with an
 * `undefined` `dsn` is a documented no-op, so this is safe with no DSN
 * configured (e.g. local development).
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" ||
    process.env.NEXT_RUNTIME === "edge"
  ) {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: 1,
      debug: false,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
