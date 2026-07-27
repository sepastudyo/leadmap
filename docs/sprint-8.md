# Sprint 8 — v1.0 Release

Source of truth: [architecture.md](./architecture.md); [docs/sprint-7-completion.md](./sprint-7-completion.md); [docs/product-hardening-backlog.md](./product-hardening-backlog.md).

**This is the final sprint.** No Sprint 9, no Sprint 10 — Sprint 8 ends the project at v1.0.0.

---

## 1. Sprint goal

Prepare LeadMap for a v1.0.0 release: polish what's already built, fix any real bugs found along the way, and perform a final production-readiness review — without adding a single new feature. Every one of the seven modules (Authentication, Dashboard, Business Discovery, Business Intelligence, Lead Organization, AI, Settings) is functionally complete as of Sprint 7; this sprint makes the experience consistent, responsive, and honest about its remaining limitations, then closes the project.

## 2. Explicit non-goals

- **No new features, endpoints, tables, or modules.** If a gap is found that would require new functionality to close, it is documented as a known limitation in the v1.0.0 release notes, not built.
- **No Sprint 9.** Anything that can't be completed within these four phases — because it needs live infrastructure this sandbox doesn't have (a real Postgres instance, a real browser, a real Vercel deployment) or a human/business decision (legal review, Vercel plan change) — is disclosed as a permanent, final limitation of this release, not deferred to a sprint that will never happen.
- **Not a re-run of the Product Hardening Backlog.** `docs/product-hardening-backlog.md`'s six items (performance pass, observability, backup/restore drill, ADRs/runbooks, commercial/legal checklist, test infrastructure) are not in scope here except where Phase 8.3 explicitly narrows to the slice of "production readiness" that's actually a code/doc review achievable in this environment (see Phase 8.3 below) — the backlog document itself remains the record of what's still open after v1.0.0 ships.

## 3. Current state going into Sprint 8

Seven sprints of functionality, one security-hardening pass (Sprint 6), and one product-completion pass (Sprint 7). Known, already-disclosed loose ends carried into this sprint:

- No live Postgres, real API keys, or real browser have been available in this sandbox at any point across all seven prior sprints — every feature has been typecheck/build-verified, never live-tested. This constraint does not lift for Sprint 8.
- A handful of small, already-flagged UI gaps: Discovery's table doesn't display the `websiteUrl`/`leadScore` values a user can now filter by (Sprint 7 Phase 7.5's own known limitation); the Business Detail "Refresh" action surfaces only the first failure's message if both force-refresh calls fail (Phase 7.6's own known limitation).
- Sprint 6's CSP/security-header work and Sprint 7's new routes have never been cross-checked against each other for drift.

---

## 4. Phase 8.1 — UI/UX Polish

**Goal:** consistency, responsiveness, and complete loading/empty/error state coverage across every page — no behavior changes, no new UI elements beyond what's needed to complete an already-existing state.

**Concrete audit targets** (grounded in what's actually in the codebase today, not generic):

- **Breakpoint consistency.** The Dashboard's three-card grid uses `sm:grid-cols-3`; the Business Detail page's Lead Score/Google Signals grid uses `lg:grid-cols-3` — two conceptually similar three-column layouts diverging on breakpoint choice. Audit every multi-column grid in the app (Dashboard, Business Detail, Settings) for this kind of drift and reconcile.
- **"You need X to use this" notice styling.** At least three separate dashed-border advisory notices exist independently (Business Detail's Google-API-key-missing notice, the AI-key-missing gating notice, `AiAuditPanel`/`OpportunityPanel`'s own internal key-missing states) — confirm they share one consistent visual treatment, not three subtly different ones that evolved independently across Sprints 3–7.
- **Discovery's filter row at narrow widths.** Four filter controls (category, rating, has-website, min-score) plus the view toggle plus the selection count now share one `flex flex-wrap` row (Sprint 7 Phase 7.5 added two controls to what was originally designed for two). Verify this still wraps sensibly on mobile rather than crowding.
- **Business Detail header at narrow widths.** The header (business name/category/address/phone/website) and the new `RefreshPanel` (Sprint 7 Phase 7.6) share one `flex items-start justify-between` row — verify a long business name doesn't crush the Refresh button off-screen on mobile.
- **Loading-state completeness.** Confirm every data-fetching client component (`DiscoveryView`, `MapView`, `RecentSearchesCard`, `AiAuditPanel`, `OpportunityPanel`, `FavoritePanel`, `NotesPanel`, `RefreshPanel`) shows a genuine loading indicator during its fetch, not just a disabled button with no other feedback.
- **Empty-state completeness.** Confirm every list (Leads with no favorites, Discovery with no results vs. no results _after filtering_, Notes with none yet, Recent Searches with none yet, AI Audit/Opportunity before first run) has distinct, honest copy — not a blank space.
- **Error-state consistency.** Confirm every error message across the app uses the same `text-destructive` treatment and the same tone (plain, actionable, no raw error codes leaking to the UI) — this has been the convention since Sprint 4 but was never audited end-to-end.
- **Optional, judgment-call item:** whether to add `websiteUrl`/`leadScore` as visible Discovery table columns, given Phase 7.5 already made them filterable but not visible. This is a _display completeness_ fix to an existing filter, not a new feature — flagged here for an explicit decision before Phase 8.1 begins, not assumed.

**Explicitly not in scope:** any new component, any new page, any new interaction pattern. This phase fixes what's inconsistent or incomplete in what already exists.

---

## 5. Phase 8.2 — Final QA

**Goal:** a complete, systematic walkthrough of every user-facing flow across all seven sprints, to catch anything Phase 8.1's polish work might have disturbed and anything that slipped through seven sprints of phase-by-phase, single-feature-at-a-time review.

**Flows to walk, end to end:**

- **Auth:** sign-up, sign-in (credentials and OAuth if configured), sign-out, rate-limited lockout messaging on repeated failures.
- **Settings:** save Google key, save AI key + provider, validation failures (missing key, invalid key), masked display after save.
- **Discovery:** a fresh search, cache-hit repeat search, pagination ("load more"), Table/Map toggle, all four filters individually and combined, a Recent Search click-through (Sprint 7 Phase 7.7's fix — confirm the form actually prefills _and_ the search actually auto-runs, not just one or the other).
- **Business Detail:** Place Details display, website analysis display, explainable Lead Score, favoriting + status/priority/follow-up, notes (add/pin/edit/delete), AI Audit and Opportunity Reasoning both with and without a stored key, the manual Refresh action (both the details and analyze calls, and the rate-limited case).
- **Leads:** list, status filter, sort, CSV export, XLSX export.
- **Cross-cutting:** every rate-limited route's `429`/`X-RateLimit-*`/`Retry-After` behavior; the CSP and security headers (Sprint 6 Phase 6.5) still present and correct on every page including the three routes Sprint 7 added; the app-level and route-level error/loading boundaries (`app/error.tsx`, `app/global-error.tsx`, the `loading.tsx` files) still trigger correctly.
- **Regression check specifically for Sprint 7's overlap with Sprint 6:** Sprint 7 modified `modules/discovery/search.ts` and `businesses-repository.ts`, both of which Sprint 6's security phases had also touched or reasoned about — confirm the Phase 6.1 rate limit on `/api/discovery/search` and the Phase 6.2 path-param validation on the CRM routes are both still intact and unaffected by Sprint 7's changes.

**Constraint, stated plainly:** this sandbox has no live Postgres, no real Google/AI API keys, and no real browser. "Walking" these flows here means static code tracing, type-level verification, and build success — not literal clicking. Any flow that cannot be meaningfully verified this way is named explicitly in the Phase 8.2 report as unverified-in-this-environment, not silently marked "done."

---

## 6. Phase 8.3 — Production Readiness

**Goal:** the slice of production-readiness that is actually a code/configuration/documentation review achievable without live infrastructure — deliberately narrower than the full Product Hardening Backlog, and explicit about which backlog items remain permanently out of reach here.

**In scope:**

- **Dependency re-audit.** Re-run `npm audit` to confirm Sprint 7 introduced no new dependencies and no new vulnerabilities beyond what Sprint 6 Phase 6.4 already investigated and found non-exploitable in this app's actual usage.
- **Security header re-verification.** Confirm Sprint 6's CSP/security headers (`next.config.ts`) still apply correctly to every route Sprint 7 added — `next.config.ts`'s `headers()` applies by path pattern (`/(.*)`), so new routes should inherit them automatically, but this needs an explicit re-check, not an assumption.
- **Environment variable validation completeness.** Review `config/env.ts` against everything actually read from `process.env` across the whole codebase (including Sprint 7's additions) to confirm nothing is read without boot-time validation.
- **Error boundary coverage.** Confirm `app/error.tsx`/`app/global-error.tsx` and route-level `loading.tsx` files still cover every route, including the three Sprint 7 added.
- **Documentation accuracy.** Confirm `README.md`'s deployment instructions, environment variable list, and feature description still match the actual, current state of the app (seven sprints in) — fix anything stale, don't rewrite anything that's still accurate.
- **Dead code / stray TODO sweep.** A final pass for anything left over from iterative phase-by-phase development — unused exports, leftover debug statements, comments referencing a "later phase" that has since landed.
- **CI green-check.** Confirm the GitHub Actions workflow (already fixed and verified passing earlier in this engagement) is still green after Sprint 7's and Sprint 8's own changes.

**Explicitly out of reach in this environment, disclosed rather than attempted:**

- **Backup/restore drill** — needs a real production Postgres instance.
- **Commercial/legal checklist** (Vercel Pro migration, Google Maps ToS review, legal/privacy review) — needs human/business decisions, not code.
- **Full performance pass** (`EXPLAIN`-verified indexes against real data volume, live RSC caching behavior) — needs a populated production-scale database.
- **Full observability confirmation** (Vercel Analytics, uptime monitor actually configured) — needs access to the live Vercel project dashboard.
- **Test infrastructure** (Vitest/Playwright) — this is new engineering scaffolding, not a "readiness review" of existing code, and is explicitly excluded from Sprint 8 per its own "no new features" boundary.

These five remain recorded in `docs/product-hardening-backlog.md` after v1.0.0 ships — Sprint 8 does not pretend to close them, and there is no Sprint 9 for them to move to.

---

## 7. Phase 8.4 — Final Review, Release, v1.0.0

**Goal:** one last whole-project review, the version bump, and the release itself.

- **Whole-project final review** — not just Sprint 8's own diff, but a check across everything built in Sprints 1–8: architecture.md compliance, no unfinished TODOs, no undocumented deviations, no duplicated logic introduced by any phase's fixes.
- **Full verification suite** (`npm run format`, `npm run lint`, `npx tsc --noEmit`, `npm run build`) as the final gate.
- **Version bump** — `package.json`'s `"version"` field to `1.0.0`.
- **Release documentation** — a comprehensive `docs/v1.0.0-release-notes.md` (or equivalently named) summarizing all eight sprints: what LeadMap does, what was explicitly built, what remains a known, permanent limitation of this release (referencing `docs/product-hardening-backlog.md`), and confirmation that this is the final planned release from this engagement.
- **Commit, tag `v1.0.0`, push** — the last commit and tag this project will produce under this plan.
- **Explicit closing statement**: project complete, no Sprint 9, no further planned work.

---

## 8. Risks

- **Scope-creep risk is the main one.** "Polish" and "fix real bugs" are inherently more open-ended than a feature list — every phase in this sprint must resist turning a polish observation into a new feature (e.g., the Discovery table-columns question in Phase 8.1 is flagged as a judgment call precisely to avoid this happening silently).
- **Verification-depth risk.** Without live infrastructure, "Final QA" and "Production Readiness" can only go as deep as static analysis and code tracing allow — this is stated as a hard constraint above, not glossed over.
- **Version-bump risk.** Bumping to `1.0.0` is a one-way signal (to anyone reading `package.json`/git tags) that this release is stable and complete — Phase 8.4 should only do this after the other three phases' findings are resolved or explicitly accepted as known limitations, not preemptively.

## 9. Acceptance criteria for v1.0.0

- [ ] Every page has a complete loading, empty, and error state — none silently blank.
- [ ] No two conceptually-identical UI patterns (advisory notices, multi-column grids, error text) diverge in styling for no documented reason.
- [ ] Every flow in Phase 8.2's walkthrough list is confirmed correct via the deepest verification this environment allows, with anything unverifiable explicitly named as such.
- [ ] `npm audit`, CSP/security headers, env-var validation, and error boundaries are all re-confirmed correct after Sprint 7's changes, not merely assumed unchanged.
- [ ] `README.md` matches current reality.
- [ ] `package.json` version is `1.0.0`.
- [ ] `docs/v1.0.0-release-notes.md` exists and honestly states both what shipped and what remains a known limitation.
- [ ] `npm run format`, `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass cleanly at the end of every phase and at final release.
- [ ] No Sprint 9 exists, is planned, or is implied anywhere in the final documentation.

---

## Progress

- [ ] Not started.
