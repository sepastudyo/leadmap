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

## Remaining findings (#6–15)

Deferred — not yet implemented. Original numbering preserved from the review.

### Medium priority

6. **Auth-guard and error-envelope boilerplate duplicated across every Route Handler.** The `auth()` + 401 check and the `{error:{code,message},request_id}` envelope are hand-rolled in each of `app/api/discovery/search/route.ts`, `app/api/settings/route.ts`, `app/api/discovery/maps-key/route.ts`. Extract `requireSession()` and `jsonError()` helpers, likely in a new `lib/http/` module, before Sprint 4/5 add more routes.
7. **`lib/idempotency` and `lib/rate-limit` don't follow the established `DbClient` repository pattern.** Every other repository accepts `dbClient: DbClient = db`; these two use the module-level `db` singleton, so a rate-limit check or idempotency write can never compose inside a shared transaction (e.g. with `modules/discovery/lock.ts`'s advisory lock).
8. **`audit_logs` never records auth events**, despite `architecture.md` §5.2 naming "auth events" as the table's first use case. Only key changes (`modules/settings/index.ts`) are logged today. Insert a row on sign-in, sign-up, and (optionally) failed credential attempts.
9. **A real-looking encryption key is hardcoded as a literal in the CI workflow** (`.github/workflows/ci.yml`, `ENCRYPTION_MASTER_KEY`). Not exploitable today (CI-only, throwaway DB), but an attractive nuisance for a future contributor to copy into a real environment. Generate fresh per run, or store as a GitHub Actions secret.
10. **`lib/db`'s "centrally scoped" soft-delete filtering doesn't exist yet** — architecture.md §5.5 says it's filtered centrally, but only `findUserByEmail` filters manually with an inline `isNull(users.deletedAt)`. Add a shared helper before Sprint 4's favorites/notes queries need the same predicate repeatedly.
11. **Business Detail Page performs three sequential blocking data fetches with no streaming** (`getOrRefreshPlaceDetails` → `getOrRunWebsiteAnalysis` → `getOrComputeLeadScore`, all inside one blocking Server Component render). The new `loading.tsx` (fix #3) covers the cold-cache wait with a skeleton, but doesn't stream partial content — wrap analysis/score sections in `<Suspense>` so the fast, already-cached header/Google-signals render immediately.

### Low priority

12. **`search_cache`'s jsonb columns aren't `.$type()`-annotated**, unlike every jsonb column Sprint 3 introduced. Forces 4 manual casts across `modules/discovery/search.ts` and one repository file. Zero-risk typing fix.
13. **`shadcn` is listed as a runtime dependency instead of a dev dependency** in `package.json` — it's a scaffolding CLI with zero runtime imports. Move to `devDependencies`.
14. **React Compiler skips memoization for `DataTable`** (informational only) — `useReactTable`'s returned functions aren't compiler-memoizable, visible as a build-time warning every run. Functionally correct today (TanStack Table manages its own state); no action needed unless the table is ever observed re-rendering more than expected.
15. **Previously-identified technical debt, restated for completeness** — already tracked in `docs/sprint-3.md`'s per-phase verification notes: (a) no function touching a live database has been run against real Postgres in this sandbox; (b) `AssembledAnalysis.status: "failed"` is a valid schema value with no code path producing it; (c) the RDFa `[typeof]` extraction path and the TikTok `/share/` / Facebook detection logic have never been exercised against a real page carrying those exact patterns. Covered by the "manual verification recommended" list already in the Sprint 3 completion report.

---

## Summary

| Severity | Count | Status |
| --- | --- | --- |
| Critical | 1 | Fixed |
| High | 4 | Fixed |
| Medium | 6 | Deferred |
| Low | 4 | Deferred |

Sprint 4 has not started. Findings #6–15 above are the punch list for whenever they're prioritized.
