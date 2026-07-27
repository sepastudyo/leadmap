# Sprint 7 Completion Report

**Status:** Complete.
**Source of truth:** [sprint-7.md](./sprint-7.md); [architecture.md](./architecture.md) §3, §6.4, §8, §12.5.

---

## Sprint objectives

Close three concrete, architecture-named product gaps left open after Sprint 6's security work — each one explicitly flagged as deferred (not forgotten) in the existing codebase's own comments, pending data or capability that later sprints had since provided:

1. Dashboard's "Recent searches" placeholder was never implemented — `search_cache`'s global, deduplicated shape (§5.1) can't carry per-user ownership without breaking Cache First, which is exactly why it was deferred rather than hacked around.
2. Discovery's filter set covered only 2 of the 5 filters architecture.md §8 names (`category`, `rating`) — `has-website` and `score band` were explicitly deferred in Sprint 2 pending `website_url`/`lead_scores` data that Sprint 3 has since built.
3. No manual force-refresh existed for Place Details or Website Analysis — architecture.md §6.4 and §12.5 both describe this capability, but neither route was ever built; both underlying functions only ever refreshed automatically on staleness.

---

## Every implemented feature

### 1. Recent Searches (Phases 7.1–7.4, plus a Phase 7.7 fix)

- **Schema:** new `search_history` table (user plane) — `id`, `user_id` (fk), `search_cache_id` (fk), `searched_at`; unique `(user_id, search_cache_id)` backs upsert-on-repeat (re-running a search bumps `searched_at` rather than duplicating), plus a `(user_id, searched_at desc)` index for the recent-list read. `search_cache` itself — the shared, deduplicated cache — is untouched.
- **Repository:** `modules/discovery/search-history-repository.ts` — `recordSearch` (upsert), `listRecentSearches` (joined with `search_cache` for display fields).
- **Wiring:** `modules/discovery/search.ts`'s `searchBusinesses` calls `recordSearch` once, only after every fallible step (Google calls, cache-lock coordination, business lookup) has already succeeded.
- **API:** `GET /api/discovery/recent-searches` — a narrow, session-scoped, zero-input read, returning the last `RECENT_SEARCHES_LIMIT` (5) distinct searches.
- **UI:** `components/dashboard/recent-searches-card.tsx` — a client component replacing the Dashboard's placeholder card, fetching on mount and rendering the search query, location, result count, and date.
- **Phase 7.7 fix:** clicking a recent search now actually works. Through Phase 7.6, the card linked to `/discovery?country=...&...` but Discovery read none of it — the click silently landed on an empty form. `discovery-view.tsx` now reads these params on mount, pre-fills the form, and auto-runs the search (a fresh `search_cache` row is typically still within its TTL, so this is ordinarily a cache hit, not a new Google call).

### 2. Extended Discovery filters (Phase 7.5)

- `modules/discovery/businesses-repository.ts`'s `getBusinessesByPlaceIds` — the discovery pipeline's single business-fetch function — now `leftJoin`s `lead_scores` and includes `leadScore`. `websiteUrl` needed no backend change; it was already selected, just not in the client type.
- `components/discovery/types.ts`'s `DiscoveryBusiness` gains `websiteUrl`/`leadScore`.
- `components/discovery/discovery-view.tsx` gains "Has website" (Any/Yes/No — labeled "No / not yet checked" to be honest about progressive enrichment) and "Min. score" filters, extending the existing client-side `filteredBusinesses` memo. Table View and Map View continue to share one filtered array.

### 3. Manual force-refresh (Phase 7.6)

- `modules/intelligence/place-details.ts`'s `getOrRefreshPlaceDetails` and `modules/intelligence/website-analysis.ts`'s `getOrRunWebsiteAnalysis` both gain an optional `{ force?: boolean }` parameter, bypassing their normal TTL staleness checks when set. Every existing caller (the RSC, `modules/ai/audit.ts`, `modules/ai/opportunity.ts`) passes no options and is unaffected.
- New `refreshWebsiteAnalysis(businessId)` orchestration wrapper (mirrors `getOrRunAiAudit`'s existing "fetch business, throw if missing, delegate" shape) — needed since `getOrRunWebsiteAnalysis` assumes the caller already has the business in hand.
- Two new routes: `POST /api/businesses/{id}/details`, `POST /api/businesses/{id}/analyze` — validated (`idParamSchema`, Phase 6.2), session-gated, independently rate-limited (`BUSINESS_REFRESH_RATE_LIMIT_MAX = 5`/60s, tighter than AI's limit since a force-refresh always spends real quota by definition).
- `components/business/refresh-panel.tsx` — a "Refresh" button on the Business Detail page, calling both routes sequentially (details first, so analysis sees a just-updated website URL), then `router.refresh()` to re-render the page's Server Component with whatever changed.

---

## Architecture compliance

- **§5.1 two-plane split preserved:** `search_history` is a new user-plane table; `search_cache` (shared, deduplicated) was never modified. Two users running an identical search still produce one `search_cache` row and two independent `search_history` rows.
- **§6.2/§6.4 Cache First preserved everywhere except the explicit manual paths:** the normal TTL-based staleness check in both `getOrRefreshPlaceDetails` and `getOrRunWebsiteAnalysis` is unchanged for every caller that doesn't pass `force` — which is every caller except the two new Phase 7.6 routes.
- **§8 filtering:** the two new filters use the exact same client-side-over-current-page mechanism the existing category/rating filters already established — no new filtering architecture.
- **§12.4 rate limiting:** the two new force-refresh routes reuse `checkRateLimit` exactly as Sprint 6 Phase 6.1 established for the AI routes, with their own separate buckets (matching the `ai.audit`/`ai.opportunity` precedent).
- **§12.5 endpoint table:** `POST /api/businesses/{id}/details` and `/analyze` fill two gaps that table named from the start but that no prior sprint had implemented.
- **§13.2/§13.3:** every new route enforces ownership through `userId` from `requireSession()` only, and validates its path param through `idParamSchema` (reused, not duplicated) — consistent with every other route in the codebase.
- **Repository pattern preserved:** every new repository function (`search-history-repository.ts`) follows the established `DbClient`-optional signature; no new abstraction layer was introduced anywhere in the sprint.

---

## Files changed

**Modified:**
`app/(dashboard)/business/[id]/page.tsx`, `app/(dashboard)/page.tsx`, `components/discovery/discovery-view.tsx`, `components/discovery/types.ts`, `config/constants.ts`, `db/migrations/meta/_journal.json`, `db/schema/index.ts`, `modules/discovery/businesses-repository.ts`, `modules/discovery/index.ts`, `modules/discovery/search.ts`, `modules/intelligence/place-details.ts`, `modules/intelligence/website-analysis.ts`

**New:**
`app/api/businesses/[id]/analyze/route.ts`, `app/api/businesses/[id]/details/route.ts`, `app/api/discovery/recent-searches/route.ts`, `components/business/refresh-panel.tsx`, `components/dashboard/recent-searches-card.tsx`, `db/migrations/0009_sprint7_search_history.sql`, `db/migrations/meta/0009_snapshot.json`, `db/schema/search-history.ts`, `docs/sprint-7.md`, `docs/sprint-7-completion.md`, `modules/discovery/search-history-repository.ts`

---

## Verification results

Final review pass, after the Phase 7.7 fix:

- `npm run format` — no changes needed.
- `npm run lint` — 0 errors; 1 pre-existing, unrelated warning (`components/data-table/data-table.tsx`, tracked as `docs/project-health-review.md` finding #14).
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; both new Phase 7.6 routes appear in the route list; no route removed or altered in shape.

During this final review, the fix itself required two iterations to get fully clean: the initial `useEffect` implementation triggered a real ESLint error (`react-hooks/set-state-in-effect`, calling `setState` synchronously in an effect body) and, after restructuring around that, a real TypeScript error (a closure-narrowing limitation — `FormState | null` not narrowing to `FormState` inside a nested function). Both were caught by actually running the verification commands rather than assuming success, and both are fixed in the final state.

---

## Remaining deferred work

Nothing from Sprint 7's own scope was deferred — all three planned features are complete, including the Phase 7.7 wiring fix. Items explicitly out of Sprint 7's scope from the start, unchanged from `sprint-7.md`'s own reasoning:

- **Distance filter** (architecture.md §8's fifth named filter) — needs a location-reference-point UI this app doesn't have; a materially bigger feature than a filter predicate, not attempted.
- **Discovery table columns for `websiteUrl`/`leadScore`** — a user can filter by these now but the table doesn't display the underlying value in a column; a natural small follow-up, not requested or implemented.
- Sprint 6's Product Hardening Backlog items (performance pass, observability, backup/restore drill, ADRs/runbooks, commercial/legal checklist, OWASP checklist doc, test infrastructure) remain exactly as tracked in `docs/product-hardening-backlog.md` — untouched by Sprint 7, as that document already anticipated.

---

## Known limitations

- Not exercised against a live Postgres instance, a real Google API key, or in a real browser in this sandbox at any point in Sprint 7 (the standing limitation noted in every prior sprint's completion report) — every feature is typecheck/build-verified, not live-tested.
- The Business Detail "Refresh" button surfaces only the first failure's message if both `/details` and `/analyze` fail in the same click, not both messages concatenated — a deliberate simplicity choice made in Phase 7.6, not an oversight.
- `search_history`'s upsert-on-repeat means the Dashboard's recent-searches list always shows distinct searches, never a literal chronological log of every search attempt — an intentional design choice (Phase 7.1), not a bug.

---

## Final conclusion

**Sprint 7 is complete.** All three planned features — Recent Searches, extended Discovery filters, and manual force-refresh — are implemented, wired end-to-end, and verified. The one real issue found during this final review (Recent Searches' navigation link not actually being read by Discovery, leaving the feature incomplete) was diagnosed precisely and fixed with a minimal, targeted change, not a redesign. No other bugs, regressions, architecture violations, or duplicated-logic problems were found across Phases 7.1–7.6. Cache First, ownership enforcement, the repository pattern, and rate limiting are all preserved exactly as established in prior sprints, extended only where this sprint's own features required it.
