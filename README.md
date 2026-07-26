# LeadMap

AI-Powered Lead Intelligence Platform for digital marketing agencies. The
system architecture, database design, and six-sprint plan are defined in
[`docs/architecture.md`](./docs/architecture.md) — the single source of
truth for this project. Sprint progress is tracked in `docs/sprint-1.md`
through `docs/sprint-6.md`.

This repository currently contains **Sprint 1 — Foundation** (see
[`docs/sprint-1.md`](./docs/sprint-1.md)): authentication, the user-plane
database schema, encrypted API key storage, an authenticated dashboard
shell, and CI/CD + error monitoring. Google integration, AI features, and
the rest of the product's business logic land in Sprints 2–6.

## Stack

TypeScript · Next.js (App Router, React Server Components) · Tailwind CSS ·
shadcn/ui · Drizzle ORM · Auth.js · Zod · PostgreSQL (Neon/Supabase) ·
Sentry.

> **Note:** this project runs on a Next.js version with breaking changes
> from what most training data reflects — e.g. `middleware.ts` is
> renamed `proxy.ts` (see [`proxy.ts`](./proxy.ts) and
> `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
> Check the bundled docs before assuming a familiar API still applies.

## Prerequisites

- Node.js 20+
- A PostgreSQL database (Neon or Supabase free tier, per architecture.md §15)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and fill in real values:

   ```bash
   cp .env.example .env.local
   ```

   Generate the two secrets with:

   ```bash
   openssl rand -base64 32
   ```

   See `.env.example` for what each variable is for. Google Maps and AI
   provider API keys are **not** environment variables — sign up, then
   enter them per-user on the Settings page; they're stored encrypted in
   the database (see architecture.md §7.2, §11.1, §13.4).

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command                | Purpose                                       |
| ---------------------- | --------------------------------------------- |
| `npm run dev`          | Start the Next.js dev server                  |
| `npm run build`        | Production build                              |
| `npm run start`        | Run the production build                      |
| `npm run lint`         | ESLint                                        |
| `npm run format`       | Format the codebase with Prettier             |
| `npm run format:check` | Check formatting without writing              |
| `npm run db:generate`  | Generate a Drizzle migration from `db/schema` |
| `npm run db:migrate`   | Apply pending migrations                      |
| `npm run db:studio`    | Open Drizzle Studio against `DATABASE_URL`    |

`db/schema` currently defines the Sprint 1 user-plane baseline (`users`,
`user_settings`, `rate_limits`, `audit_logs`); more tables land sprint by
sprint per architecture.md §5.

## Project structure

Business logic lives in framework-light `modules/`; `app/` is a thin
transport layer. See architecture.md §4 for the full rationale.

```
leadmap/
├── app/            # Next.js App Router — routing + transport only
│   ├── (auth)/               # sign-in / sign-up routes
│   ├── (dashboard)/          # authenticated shell: dashboard + settings built;
│   │                         # discovery/business/leads are Sprint 2-4 stubs
│   └── api/                  # Route Handlers: Auth.js, /api/settings
├── modules/        # Domain logic — no Next.js/React imports
│   ├── auth/ settings/       # built (Sprint 1)
│   ├── google/ discovery/    # Sprint 2 stubs
│   ├── intelligence/{analysis,scoring}/  # Sprint 3 stubs
│   ├── crm/                  # Sprint 4 stub
│   ├── ai/                   # Sprint 5 stub
│   └── shared/                # built (Sprint 1)
├── lib/            # Cross-cutting infra
│   ├── db/ crypto/ validation/ observability/  # built (Sprint 1)
│   └── rate-limit/            # Sprint 2 stub (search rate limiting)
├── db/
│   ├── schema/ migrations/ seed/
├── components/     # UI primitives (shadcn/ui)
├── config/         # env parsing/validation, constants, feature flags
├── proxy.ts        # edge auth gate (Next.js 16's renamed `middleware.ts`)
├── instrumentation.ts / instrumentation-client.ts  # Sentry init
└── docs/           # architecture.md, sprint-1.md … sprint-6.md
```

Modules scoped for a later sprint still export nothing (`export {}`) —
they exist to establish the folder structure ahead of the logic that
will fill them in.

## Deployment

**Prerequisites:**

- A [Vercel](https://vercel.com) account with this repo connected via
  its Git integration (auto-deploys `main` to production, PRs to
  preview environments).
- A [Neon](https://neon.tech) or [Supabase](https://supabase.com)
  Postgres project — use the **pooled** connection string
  (architecture.md §15; `lib/db/index.ts` disables prepared statements
  specifically for pgbouncer-style poolers).
- A [Sentry](https://sentry.io) project (optional but recommended —
  the app runs fine with `SENTRY_DSN` unset, it just won't report
  errors).

**Vercel project environment variables** (Project Settings →
Environment Variables — set for Production, and separately for Preview
if you want preview deployments to have a working database/auth):

| Variable                                              | Notes                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                        | Pooled Neon/Supabase connection string                                               |
| `AUTH_SECRET`                                         | `openssl rand -base64 32`                                                            |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`               | Optional OAuth provider                                                              |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`               | Optional OAuth provider                                                              |
| `ENCRYPTION_MASTER_KEY`                               | `openssl rand -base64 32` — **do not rotate casually**, it decrypts every stored key |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`               | From your Sentry project's Client Keys settings (same DSN, both vars)                |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | Needed for Sentry source-map upload during Vercel's own build                        |
| `NEXT_PUBLIC_APP_URL`                                 | The deployment's real URL (used in OAuth callback construction)                      |

**Database migrations:** Vercel's build step (`next build`) does **not**
run migrations — deploying new code and migrating the schema are
deliberately decoupled (architecture.md §15 "gated forward-only
migrations"). Production migrations run via the `migrate-production` job
in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml), gated
behind `verify` passing on `main`. To enable it, add a **repository**
secret (not an environment secret — see the comment in `ci.yml` for why)
named `PRODUCTION_DATABASE_URL` pointing at the same pooled connection
string, and configure a `production` GitHub Environment if you want
deployment protection rules. Because migrations are additive-only at
this stage, the exact ordering relative to Vercel's own deploy isn't
critical; that stops being true once a migration ever removes or
renames a column, at which point the deploy should explicitly wait on
the migration job.

**Vercel plan:** Hobby works for development/demos, but its terms are
for non-commercial use — move to Pro before a commercial launch
(architecture.md §18). This is a plan change only; nothing here is
architecturally Hobby-specific.

**Post-deploy smoke test:** visit the production URL (should redirect
to `/sign-in`), sign up, save a Google API key in Settings, confirm the
dashboard renders its empty state.
