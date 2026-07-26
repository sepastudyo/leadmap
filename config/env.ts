import "server-only";
import { z } from "zod";

/**
 * Application secrets, validated once at boot so misconfiguration fails
 * fast instead of surfacing as a runtime error deep in a request
 * (architecture.md §13.4). This covers infrastructure secrets only —
 * user-provided Google/AI keys are BYOK, stored encrypted in
 * `user_settings`, and never come from process.env (architecture.md §7.2, §11.1).
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Postgres connection (Neon/Supabase, pooled) — architecture.md §15
  DATABASE_URL: z.url(),

  // Auth.js — architecture.md §13.1
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),

  // AES-256-GCM envelope encryption master key for user-provided keys — architecture.md §13.4
  ENCRYPTION_MASTER_KEY: z
    .string()
    .min(32, "ENCRYPTION_MASTER_KEY must be at least 32 characters"),

  // Observability — architecture.md §15. Preprocessed because an unset
  // optional var commonly arrives as an empty string (e.g. `KEY=` in an
  // env file), which `.optional()` alone does not tolerate against `z.url()`.
  SENTRY_DSN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().optional(),
  ),
  // Client-exposed counterpart of SENTRY_DSN, read directly from
  // `process.env` in `instrumentation-client.ts` (a client-side file
  // that cannot import this `server-only` module) — validated here too
  // so a malformed value still fails fast at boot rather than silently
  // disabling client-side error reporting.
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().optional(),
  ),

  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.treeifyError(parsed.error));
  throw new Error("Invalid environment variables — see console output above.");
}

export const env = parsed.data;
