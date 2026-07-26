import "server-only";
import * as Sentry from "@sentry/nextjs";

/**
 * Logger and error-reporting wrappers (architecture.md §15). Thin
 * re-export over `@sentry/nextjs` so call sites depend on this module,
 * not the vendor SDK directly — a provider change touches one file
 * (the same anti-corruption-layer rationale as `modules/google`,
 * `modules/ai`; architecture.md §4). Sentry itself is initialized in
 * `instrumentation.ts` (server/edge) and `instrumentation-client.ts`
 * (browser), not here.
 */
export const captureException = Sentry.captureException;
export const captureMessage = Sentry.captureMessage;
