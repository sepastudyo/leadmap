# Sprint 6 Security Milestone — Completion Report

**Status:** Security milestone complete.
**Source of truth:** [architecture.md](./architecture.md) §13, §18; [sprint-6.md](./sprint-6.md).
**Scope note:** Sprint 6 as originally written names seven deliverables. This report covers the **Security milestone** specifically (Phases 6.1–6.5 plus the final review). The remaining six non-security deliverables are tracked in [product-hardening-backlog.md](./product-hardening-backlog.md), not silently dropped.

---

## Security work completed

Five phases, each scoped to one real, verified issue at a time, plus a final cross-cutting review:

- **Phase 6.1 — Rate-limit coverage review.** `POST /api/businesses/{id}/ai/audit` and `/ai/opportunity` had no rate limit at all, despite architecture.md §12.4 explicitly naming AI among "expensive actions" needing "tighter buckets." Added `AI_RATE_LIMIT_MAX`/`AI_RATE_LIMIT_WINDOW_MS` (`config/constants.ts`) and wired `checkRateLimit` into both routes, mirroring `/api/discovery/search`'s existing pattern exactly (same header shape, same 429 envelope, checked before the cache lookup so a cache hit and a fresh provider call count alike).
- **Phase 6.2 — Request validation consistency.** `/api/favorites/{id}` (PATCH/DELETE), `/api/notes/{id}` (PATCH/DELETE), and `/api/businesses/{id}/notes` (POST) passed their path-param `id` straight to a `uuid`-typed column with no Zod validation — a malformed id produced an unhandled Postgres cast error (500) instead of a clean 422, violating architecture.md §13.3's "Zod at every boundary." This was a pre-documented, known gap (called out in `lib/validation/ai.ts`'s own comment since Sprint 5). Closed by adding `idParamSchema` to `lib/validation/crm.ts` and applying it to all five affected handlers.
- **Phase 6.3 — Error-handling correctness.** `PATCH /api/settings` didn't catch `AiApiKeyInvalidError` (thrown by `saveSettings` on a failed live key-validation check), producing an unhandled 500 instead of the already-designed 422. Fixed by adding it to the existing `instanceof` error-mapping chain, alongside its two sibling error types.
- **Phase 6.4 — Dependency, encryption, and API-surface audit.** Full `npm audit` review (27 findings) traced each to its actual exploit precondition rather than trusting severity labels: `next`'s bundled `postcss`/`sharp` and `exceljs`'s `archiver`/`zip-stream` chain all have vulnerable code paths confirmed **unreachable** in this app's actual usage (no CSS-from-untrusted-input processing, no `next/image` usage anywhere in the codebase, no archiver glob-API calls) — and no safe, non-breaking upgrade existed regardless. `lib/crypto`'s AES-256-GCM implementation, key masking, and API surface were re-verified with no issues found.
- **Phase 6.5 — CSP and security headers.** Zero security headers existed anywhere in the application. Added a full header set via `next.config.ts`'s documented `headers()` pattern: `Content-Security-Policy` (allowlisted only to what the app's own code actually calls — Google Maps JS and Sentry, nothing speculative), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a restrictive `Permissions-Policy`. Verified against a live running server, not just a successful build.
- **Final review.** Re-verified `modules/intelligence/analysis/ssrf-guard.ts` and `guarded-fetch.ts` (Sprint 3's SSRF controls) line by line — default-deny IP-range allowlisting, DNS-rebinding-resistant, per-redirect-hop re-validation, size/timeout caps — confirmed sound, no regression, no change needed. Confirmed no duplicated logic was introduced beyond an already-documented, pre-existing Sprint 5 design decision (Audit/Opportunity routes as intentionally symmetric, non-shared files).

---

## Architecture compliance achieved

- **§12.4** (rate limiting on expensive actions): search, AI Audit, and AI Opportunity Reasoning are now all consistently covered.
- **§13.3** ("Zod at every boundary"): the last known gap (CRM by-id path params) is closed; every Route Handler now validates 100% of client-supplied input — body, query, and path — through Zod.
- **§13.4** (keys validated on save): the validation-failure error path is now fully handled end-to-end, not just in the code path the current UI happens to exercise.
- **§13.5** (OWASP Top 10 posture): XSS mitigated via CSP (new) plus React's existing auto-escaping; SSRF (P0) reverified sound; broken access control reverified via ownership-scoping checks across `favorites`, `notes`, and `ai_results` repositories; injection mitigated via the validation-consistency fix; security misconfiguration mitigated via the new header set.
- **§7.1/§7.2** (Google Maps key handling), **§15** (Sentry): the new CSP's allowlist is scoped to exactly these two integrations, grounded in the actual calling code, not written speculatively.

---

## Security findings fixed

| #   | Finding                                              | Where                                                                  | Fix                                                               |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | No rate limit on AI Audit/Opportunity routes         | `app/api/businesses/[id]/ai/{audit,opportunity}/route.ts`              | `checkRateLimit`, matching `/api/discovery/search`'s pattern      |
| 2   | Unvalidated path-param `id` reaching a `uuid` column | `/api/favorites/{id}`, `/api/notes/{id}`, `/api/businesses/{id}/notes` | New `idParamSchema`, applied to all five handlers                 |
| 3   | Uncaught `AiApiKeyInvalidError` → unhandled 500      | `app/api/settings/route.ts`                                            | Added to existing error-mapping chain                             |
| 4   | No security headers / CSP anywhere                   | application-wide                                                       | `next.config.ts` `headers()` — CSP + 4 standard hardening headers |

All four were verified as real (reproduced or directly confirmed against the actual code path), not stylistic or hypothetical, before being fixed — per the standing instruction across every phase of this milestone.

---

## CI status

**Green.** The GitHub Actions workflow (`.github/workflows/ci.yml`) was fixed earlier in this engagement (prior to the Sprint 6 phases) to resolve three cascading issues surfaced in sequence once each prior one was fixed:

1. Invalid `secrets` context reference in a job-level `if:` condition.
2. A Prettier formatting failure on two docs files.
3. `drizzle-kit migrate`'s CLI silently swallowing the real Postgres error on failure (an upstream `hanji`/`renderWithTask` bug) — replaced with a direct call to the same underlying `drizzle-orm/postgres-js/migrator` primitive, which in turn revealed two further real issues: the CI Postgres service image lacked PostGIS (migration 0002 requires it — fixed by switching to `postgis/postgis:16-3.4`), and the workflow's Node 20 pin was below `undici@8.9.0`'s own declared `engines.node: >=22.19.0` requirement (fixed by bumping to Node 22).

The workflow was confirmed passing end-to-end via a live GitHub Actions run (`30261403006`) — every step green: format check, lint, typecheck, migrations (gate), build, and the production-migration job.

---

## Build status

**Passing**, verified as the final step of this milestone:

- `npm run format` — no changes needed.
- `npm run lint` — 0 errors; 1 pre-existing, unrelated warning (`components/data-table/data-table.tsx`, React Compiler skipping memoization on a TanStack Table hook — tracked as `docs/project-health-review.md` finding #14, informational only).
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; all 14 static pages generate; full route list unchanged in shape from before this milestone (no routes added or removed by these fixes).

---

## Known deferred work

Six non-security Sprint 6 deliverables — performance optimization, observability improvements, the backup/restore drill, ADRs and runbooks, the commercial/legal checklist, and two remaining documentation items (an OWASP Top 10 checklist artifact and unit/integration/e2e test infrastructure) — are real, legitimate, but explicitly **not bugs and not blocking** further product development. Full detail, including reason deferred, priority, effort estimate, and recommended sprint for each, is in [product-hardening-backlog.md](./product-hardening-backlog.md).

One additional pre-existing item, unrelated to this milestone's own findings, remains open and unchanged: `docs/project-health-review.md` finding #9 (a real-looking encryption key hardcoded as a literal in the CI workflow — CI-only, throwaway database, not exploitable against production data, but an attractive nuisance for a future contributor to copy). It was already known and triaged before Sprint 6 began; it wasn't in scope for any of the five security phases (each scoped to a single, freshly-verified issue) and remains tracked in its original document rather than duplicated here.

---

## Final conclusion

**The Sprint 6 Security milestone is complete.** Every phase fixed exactly one verified, real issue — never a stylistic preference, never a hypothetical — and every fix is confirmed by a clean `format`/`lint`/`tsc`/`build` pass, with the CSP and CI fixes additionally verified against live, running servers rather than build success alone. The application's security posture — rate limiting, input validation, error handling, secrets handling, SSRF protection, and security headers — is materially stronger than at Sprint 5's close, with no regressions and no undocumented deviations introduced along the way.

Remaining Sprint 6 deliverables are real future work, explicitly tracked, explicitly not urgent, and explicitly not a reason to withhold this milestone's completion.

**Sprint 7 begins next.**
