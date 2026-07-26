# Sprint 1 — Foundation

Source of truth: [architecture.md](./architecture.md) §17.

## Objectives

- Stand up the single Next.js application skeleton (no monorepo) per the folder structure in §4.
- Implement authentication (email/password + OAuth) via Auth.js.
- Establish the baseline database schema for the user plane: `users`, `user_settings`, `rate_limits`, `audit_logs`.
- Implement AES-256-GCM envelope encryption for user-provided secrets.
- Build the Settings page to store and validate the user's Google API key and AI API key/provider.
- Build an empty dashboard shell (RSC).
- Wire up Postgres connection pooling, CI/CD, and error monitoring, and deploy to production.

## Deliverables

- Next.js app scaffold (App Router, TypeScript, RSC).
- Auth.js configured for email/password and OAuth (Google/GitHub); secure httpOnly session cookies.
- DB schema baseline: `users`, `user_settings`, `rate_limits`, `audit_logs` (migrations in `db/migrations`).
- `lib/crypto` — AES-256-GCM envelope encryption for `google_api_key_enc` / `ai_api_key_enc`.
- Settings page: save/validate Google API key and AI API key + provider selection.
- Dashboard shell (empty state, RSC).
- Postgres connection pooler configured (Neon/Supabase pooler).
- CI/CD pipeline (GitHub Actions): lint, typecheck, build, gated migrations.
- Sentry error monitoring wired in.
- Deployed to Vercel + Neon (or Supabase).

**Working app milestone:** sign in, save/validate API keys, see an (empty) dashboard on production.

## Progress

- [x] Next.js app scaffold (App Router, TypeScript, RSC).
- [x] Auth.js configured for email/password and OAuth (Google/GitHub); secure httpOnly session cookies.
- [x] DB schema baseline: `users`, `user_settings`, `rate_limits`, `audit_logs` (migrations in `db/migrations`).
- [x] `lib/crypto` — AES-256-GCM envelope encryption for `google_api_key_enc` / `ai_api_key_enc`.
- [x] Settings page: save/validate Google API key and AI API key + provider selection
      (`app/(dashboard)/settings`, `modules/settings`, `app/api/settings`). "Validate" at this
      stage is shape/format validation + pairing rules (a provider requires a key, clearing a
      provider clears its key); live verification against Google/AI providers needs the clients
      built in Sprint 2 (`modules/google`) and Sprint 5 (`modules/ai`) and is out of scope here.
- [x] Dashboard shell (empty state, RSC) at `app/(dashboard)/page.tsx`, gated by
      `proxy.ts` (Next.js 16's renamed `middleware.ts`) plus a session check in
      `app/(dashboard)/layout.tsx`.
- [x] Postgres connection pooler support: `lib/db/index.ts` disables prepared statements
      (`prepare: false`), which is required for transaction-mode poolers (Neon/Supabase
      pgbouncer). Pointing `DATABASE_URL` at an actual pooled endpoint is a per-environment
      infra step — see README.md "Deployment".
- [x] CI/CD pipeline (`.github/workflows/ci.yml`): format check, lint, typecheck, gated
      migrations against an ephemeral Postgres service, build — plus a `migrate-production`
      job that applies the same migrations to the real database after `verify` passes on
      `main`, gated behind a repository secret the deploying team must add.
- [x] Sentry error monitoring wired in (`instrumentation.ts`, `instrumentation-client.ts`,
      `next.config.ts` via `withSentryConfig`, `lib/observability`). Reports nothing until a
      real `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` is configured.
- [ ] Deployed to Vercel + Neon (or Supabase). Deployment configuration is in place
      (`vercel.json`, README.md "Deployment" runbook, the env var contract in
      `config/env.ts`/`.env.example`), but the actual deploy requires the team's own
      Vercel/Neon (or Supabase) accounts and credentials, which this repo doesn't have —
      connect the Git repo in Vercel, set the documented environment variables, and push
      to `main`.

**Verification run:** `npm run format:check`, `npm run lint`, `npx tsc --noEmit`, and
`npm run build` all pass. No live Postgres was available in the sandbox this was built in,
so the settings save/encrypt round-trip is verified by strict typechecking and code review
rather than an end-to-end run against a real database — worth a manual smoke test (sign up,
save a Google API key, confirm the masked state persists across reload) against a real
`DATABASE_URL` before considering the milestone fully closed.
