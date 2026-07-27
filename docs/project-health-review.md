# LeadMap — Project Health Review

**Review date:** 2026-07-27
**Scope:** full codebase (excluding `node_modules`, `.next`), `docs/architecture.md` as the baseline. Review only — no code was changed as part of the review itself.
**Status at time of review:** Sprint 3 complete, Sprint 4 not started.

---

## Implemented fixes (#1–5)

Fixed on 2026-07-27, commit `1e81049` ("chore: address pre-sprint-4 health review"). Critical and High priority findings only — Medium and Low priority findings were deferred (see below).

### 1. No rate limiting or lockout on sign-in / sign-up (Critical)

`authenticate()` and `register()` now call `checkRateLimit` before calling `signIn()` / creating a user — 5 attempts per 5-minute window, keyed by IP (via `x-forwarded-for` / `x-real-ip`, since an unauthenticated caller has no user id yet). New constants: `AUTH_SIGNIN_RATE_LIMIT_MAX`, `AUTH_SIGNIN_RATE_LIMIT_WINDOW_MS`, `AUTH_SIGNUP_RATE_LIMIT_MAX`, `AUTH_SIGNUP_RATE_LIMIT_WINDOW_MS` in `config/constants.ts`. Both sign-in and sign-up pages show a `RateLimited` error message.

**Files:** `app/(auth)/sign-in/actions.ts`, `app/(auth)/sign-in/page.tsx`, `app/(auth)/sign-up/actions.ts`, `app/(auth)/sign-up/page.tsx`, `config/constants.ts`

### 2. Stale, drifted duplicate of the architecture document (High)

`LeadMap-Architecture-v2.md` moved from the repo root to `docs/archive/LeadMap-Architecture-v2.md`, with a header marking it superseded and frozen. `docs/architecture.md` remains the single source of truth.

**Files:** `docs/archive/LeadMap-Architecture-v2.md` (renamed from root)

### 3. No error/loading/not-found boundaries in the App Router tree (High)

Added `app/error.tsx` and `app/global-error.tsx` (both report to Sentry via `captureException`, using `unstable_retry` per this Next.js version's error-boundary API — see `AGENTS.md`/`node_modules/next/dist/docs`). Added `loading.tsx` skeletons to `app/(dashboard)/business/[id]/` and `app/(dashboard)/discovery/`, the two routes with the highest data-fetching cost.

**Files:** `app/error.tsx`, `app/global-error.tsx`, `app/(dashboard)/business/[id]/loading.tsx`, `app/(dashboard)/discovery/loading.tsx`

### 4. Google API clients have no request timeout (High)

`searchPlaces`, `geocode`, and `getPlaceDetails` now default to an `AbortSignal.timeout(GOOGLE_API_TIMEOUT_MS)` (8s, matching `ANALYZER_TIMEOUT_MS`) whenever no caller-supplied signal is passed, combined with a caller signal via `AbortSignal.any` when one is — same composition `guardedFetch` already used. New shared helper `resolveRequestSignal` in `modules/google/request-signal.ts`; new constant `GOOGLE_API_TIMEOUT_MS` in `config/constants.ts`.

**Files:** `modules/google/request-signal.ts` (new), `modules/google/places-search.ts`, `modules/google/geocode.ts`, `modules/google/place-details.ts`, `config/constants.ts`

### 5. Broad catch blocks swallow all errors with zero observability (High)

Wired `captureException` (from `lib/observability`, already present but previously unused outside `modules/settings`) into the two swallow points the review named as the minimum bar: the outer catch in `getOrRunWebsiteAnalysis` (total acquisition failure, still degrades to the last persisted analysis, but now reports first), and `guardedFetch`'s generic non-timeout failure path (a timeout itself is left unreported — it's an expected condition, not a bug).

**Files:** `modules/intelligence/website-analysis.ts`, `modules/intelligence/analysis/guarded-fetch.ts`

**Verification:** `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass (same one pre-existing benign React Compiler warning on `components/data-table/data-table.tsx`, tracked as finding #14).

---

## Fixed during Sprint 4 (#6, #10)

Two Medium findings were folded into Sprint 4 because they directly supported it (approved at the start of Sprint 4, before Phase 4.1).

### 6. Auth-guard and error-envelope boilerplate duplicated across every Route Handler (Medium → Fixed)

Extracted into `lib/http/index.ts` (`requireSession`, `jsonData`, `jsonError`), Sprint 4 Phase 4.2. Retrofitted onto all 3 pre-existing routes (`discovery/search`, `settings`, `discovery/maps-key`) as well as every new Sprint 4 route (`favorites`, `favorites/{id}`, `businesses/{id}/notes`, `notes/{id}`, `export`).

**Files:** `lib/http/index.ts` (new), plus every route under `app/api/`.

### 10. `lib/db`'s "centrally scoped" soft-delete filtering didn't exist (Medium → Fixed)

Added `notDeleted()` to `lib/db/index.ts`, Sprint 4 Phase 4.1. Retrofitted onto `modules/auth/users.ts`'s `findUserByEmail`; used by every query in `modules/crm/favorites-repository.ts` and `notes-repository.ts` (confirmed by Sprint 4 Phase 4.7's final review — no query against `favorites`/`notes` anywhere in the codebase omits it).

**Files:** `lib/db/index.ts`, `modules/auth/users.ts`, `modules/crm/favorites-repository.ts`, `modules/crm/notes-repository.ts`.

---

## Remaining findings (#7–9, #11–15)

Still deferred — not yet implemented. Original numbering preserved from the review. Sprint 4 did not touch any of these; nothing here regressed or improved.

### Medium priority

7. **`lib/idempotency` and `lib/rate-limit` don't follow the established `DbClient` repository pattern.** Every other repository accepts `dbClient: DbClient = db`; these two use the module-level `db` singleton, so a rate-limit check or idempotency write can never compose inside a shared transaction (e.g. with `modules/discovery/lock.ts`'s advisory lock).
8. **`audit_logs` never records auth events**, despite `architecture.md` §5.2 naming "auth events" as the table's first use case. Only key changes (`modules/settings/index.ts`) are logged today. Insert a row on sign-in, sign-up, and (optionally) failed credential attempts.
9. **A real-looking encryption key is hardcoded as a literal in the CI workflow** (`.github/workflows/ci.yml`, `ENCRYPTION_MASTER_KEY`). Not exploitable today (CI-only, throwaway DB), but an attractive nuisance for a future contributor to copy into a real environment. Generate fresh per run, or store as a GitHub Actions secret.
10. **Business Detail Page performs three sequential blocking data fetches with no streaming** (`getOrRefreshPlaceDetails` → `getOrRunWebsiteAnalysis` → `getOrComputeLeadScore`, all inside one blocking Server Component render). Sprint 4 added more reads to this same page (favorite/notes) directly through the repository layer, same pattern, same lack of streaming — the gap is unchanged, not worsened. Wrap analysis/score sections in `<Suspense>` so the fast, already-cached header/Google-signals render immediately.

### Low priority

12. **`search_cache`'s jsonb columns aren't `.$type()`-annotated**, unlike every jsonb column Sprint 3 introduced. Forces 4 manual casts across `modules/discovery/search.ts` and one repository file. Zero-risk typing fix.
13. **`shadcn` is listed as a runtime dependency instead of a dev dependency** in `package.json` — it's a scaffolding CLI with zero runtime imports. Move to `devDependencies`.
14. **React Compiler skips memoization for `DataTable`** (informational only) — `useReactTable`'s returned functions aren't compiler-memoizable, visible as a build-time warning every run. Functionally correct today (TanStack Table manages its own state); no action needed unless the table is ever observed re-rendering more than expected.
15. **Previously-identified technical debt, restated for completeness** — already tracked in `docs/sprint-3.md`'s per-phase verification notes: (a) no function touching a live database has been run against real Postgres in this sandbox — still true through all of Sprint 4 as well; (b) `AssembledAnalysis.status: "failed"` is a valid schema value with no code path producing it; (c) the RDFa `[typeof]` extraction path and the TikTok `/share/` / Facebook detection logic have never been exercised against a real page carrying those exact patterns. Covered by the "manual verification recommended" lists already in the Sprint 3 and Sprint 4 completion reports.

## New items surfaced during Sprint 4 (not numbered findings — see docs/sprint-4.md)

Two post-Sprint-4 improvements were identified and explicitly deferred by decision, not oversight:

- **architecture.md §3's "recent searches (from `search_cache` owned by the user)"** contradicts §5.1/§5.2/§6.3's explicit global-shared-cache design for `search_cache`. Recommended fix: correct the wording in architecture.md; do not add a `user_id` column or a new table. Left as a placeholder on the Dashboard, wording fix deferred to you.
- **`GET /api/favorites` keys a row `favoriteId`; `POST`/`PATCH` on the same resource key it `id`.** A naming inconsistency across verbs on one resource, introduced when `GET` was enriched for the Leads page (Sprint 4 Phase 4.4). Recommended fix: rename `favoriteId` → `id` in the `GET` response.

---

## Summary

| Severity | Count | Status                         |
| -------- | ----- | ------------------------------ |
| Critical | 1     | Fixed                          |
| High     | 4     | Fixed                          |
| Medium   | 6     | 2 Fixed (Sprint 4), 4 Deferred |
| Low      | 4     | Deferred                       |

Sprint 4 is complete (see docs/sprint-4.md). Findings #7–9, #11–15, and the two new items above are the punch list for whenever they're prioritized — none are Sprint 4 blockers.
