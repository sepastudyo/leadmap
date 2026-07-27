# Sprint 7 — Discovery & Dashboard Completion

Source of truth: [architecture.md](./architecture.md) §3, §6.4, §8, §10, §12.5.

This sprint is scoped from **concrete, already-documented gaps** between architecture.md's own requirements and what Sprints 1–6 actually shipped — not new ideas. All three items below were flagged in the existing codebase's own comments as deferred pending data or capability that later sprints would provide; that data now exists. Nothing here is a new module, a redesign, or infrastructure — it is completing what Sprints 2–3 explicitly left open.

---

## 1. Sprint goal

Close the three concrete, architecture-named product gaps left open after Sprint 6's security work: an unimplemented "Recent searches" Dashboard section, an incomplete Discovery filter set, and the absence of any manual force-refresh action on the Business Detail page. All three are explicitly named in architecture.md and explicitly documented as deferred (not forgotten) in the current code.

## 2. User value

- **Recent searches:** a user who ran ten searches yesterday can pick up where they left off today without re-entering Country/City/Category from memory — the Dashboard becomes a real landing page instead of two live widgets and one permanent placeholder.
- **Discovery filters (has-website, score band):** an agency scanning a fresh search result set can immediately narrow to "businesses with no website" or "score 70+" — exactly the kind of triage architecture.md §8 was written to support — instead of opening each business one by one to find out.
- **Manual refresh:** if a business's phone number or website has visibly changed since it was last opened, or a re-analysis is wanted after fixing something onsite, the user can force a refresh on demand instead of waiting out an opaque TTL with no visible control.

## 3. Deliverables

1. **Recent Searches** — a new user-plane table recording which `search_cache` entries a signed-in user has actually run; the Dashboard's existing placeholder card is replaced with a real, pull-based list of the user's last 5 searches, each re-runnable with one click.
2. **Extended Discovery filters** — `POST /api/discovery/search`'s response gains `websiteUrl` and `leadScore` per business (both already stored, just not surfaced here); the Discovery table gains "Has website" and "Min. score" filters alongside the existing category/rating ones, applied client-side over the current page exactly like the two that already exist.
3. **Manual force-refresh** — `getOrRefreshPlaceDetails` and `getOrRunWebsiteAnalysis` gain a `force` option; two new rate-limited routes (`POST /api/businesses/{id}/details`, `POST /api/businesses/{id}/analyze}`) expose it, matching architecture.md §12.5's own endpoint table verbatim; the Business Detail page gets a single "Refresh" action that calls both and re-renders with the updated data.

## 4. Architecture impact

None of these introduce a new module, a new data plane, or a new pattern — each reuses something Sprints 1–6 already established:

- Recent Searches follows §5.1's two-plane split exactly: a new **user-plane** table records _who searched what, when_, while `search_cache` remains the untouched, global, deduplicated **shared-plane** cache. No change to Cache First's dedup guarantee — two users searching the same query still produce one `search_cache` row; each gets their own `search_history` row pointing at it.
- Discovery filters add fields to an existing response and add client-side filter predicates next to the two (`category`, `rating`) already implemented in `discovery-view.tsx` — no new filtering mechanism.
- Manual refresh threads one new boolean through two existing functions and exposes it via two routes that architecture.md's §12.5 table already names but which were never built (Place Details/analysis have so far only ever refreshed automatically on staleness) — it reuses `lib/rate-limit`'s `checkRateLimit` exactly as Sprint 6 Phase 6.1 wired it into the AI routes, and `lib/http`'s `jsonData`/`jsonError`/`requireSession` exactly as every other route already does.

## 5. Database changes

One new migration, one new table:

**`search_history`** — USER plane
`id (uuid pk)` · `user_id (fk → users)` · `search_cache_id (fk → search_cache)` · `searched_at (timestamptz)`
**Unique `(user_id, search_cache_id)`** — re-running a search a user has already run bumps `searched_at` (upsert) rather than creating a duplicate entry, the same "stamp on access" idea `search_cache.last_accessed_at` already uses, so a user's recent list shows distinct searches, most-recent-first, not a repeat-cluttered log.
**Index:** btree `(user_id, searched_at desc)` for the "last 5" read.

No changes to any existing table. `businesses.website_url` and `lead_scores.total` (both already in the schema since Sprint 3) are read, not altered, for the Discovery filter work.

## 6. API changes

- **`POST /api/discovery/search`** — response `data[]` items gain two additive, nullable fields: `websiteUrl` and `leadScore`. Existing fields unchanged; this is backward compatible.
- **`POST /api/businesses/{id}/details`** (new) — force-refreshes Place Details regardless of `details_expires_at`. Rate-limited (new bucket, same `checkRateLimit` mechanism as Sprint 6 Phase 6.1). Auth + ownership follow the same `requireSession` pattern every other route uses (no ownership scoping needed beyond auth — `businesses` is shared-plane, per §5.1).
- **`POST /api/businesses/{id}/analyze`** (new) — force re-runs the website analysis pipeline regardless of `expires_at`. Same rate-limit/auth treatment as above.

No changes to any existing route's request shape or error codes.

## 7. UI changes

- **Dashboard** (`app/(dashboard)/page.tsx`): the "Recent searches" placeholder card is replaced with a real list (last 5, most-recent-first), each entry showing the search's key params (country/city/category/keyword) and linking back to Discovery with the form pre-filled to re-run it.
- **Discovery** (`components/discovery/discovery-view.tsx`): two new filter controls ("Has website" — Any/Yes/No, "Min. score" — a numeric threshold) placed next to the existing category/rating filters, following the exact same controlled-input pattern already there.
- **Business Detail** (`app/(dashboard)/business/[id]/page.tsx` + a new small client component): one "Refresh" button near the top of the page, disabled while in flight, showing a brief success/error state, then reflecting updated Google Signals / Analysis Summary content.

## 8. Risks

- **Recent Searches' upsert-on-repeat semantics** (re-running a search moves it to the top rather than adding a new row) is a deliberate design choice, not a bug, but should be visibly documented in the UI copy (e.g., no duplicate entries appearing) so it doesn't read as a data-loss bug during review.
- **Discovery filters interact with progressive enrichment:** a business with no website (`websiteUrl: null`) is indistinguishable at the API level from a business that simply hasn't been individually opened yet (Place Details never fetched for it, per §3's "on-demand, not bulk" enrichment rule — search never runs Place Details for every result). The "Has website" filter's "No" option will therefore also catch not-yet-enriched businesses. This is inherent to Cache First's progressive-enrichment model, not a defect introduced here, but the UI copy needs to say "No / not yet checked" rather than a bare "No" to avoid implying false certainty.
- **Manual refresh cost:** force-refreshing spends the user's own Google Places quota (a real API call) and re-runs the analysis pipeline (a real HTTP fetch to the target site) — both already rate-limited per this sprint's design, but the button's copy should make the "this uses your API key" cost visible, matching the AI panels' existing "uses your configured AI provider key" precedent.

## 9. Acceptance criteria

- [ ] Running the same search twice as the same user shows one entry in "Recent searches," not two, with the more recent timestamp.
- [ ] Two different users running the identical search still produce exactly one `search_cache` row (Cache First unaffected) and two independent `search_history` rows.
- [ ] The Dashboard's "Recent searches" card renders real data for a user who has searched before, and a sensible empty state for one who hasn't.
- [ ] Filtering Discovery results by "Has website: No" excludes any row with a non-null `websiteUrl`.
- [ ] Filtering Discovery results by "Min. score: 70" excludes any row with `leadScore < 70` or `leadScore: null`.
- [ ] Table View and Map View continue to render the exact same filtered set (the existing "one filtered array feeds both" invariant is not broken by the two new filters).
- [ ] Clicking "Refresh" on a Business Detail page updates `details_expires_at`/`expires_at` even when the existing data was still fresh (a true force, not a no-op when not stale).
- [ ] Refresh is rejected with `429` once the configured rate limit is exceeded, with the same `X-RateLimit-*`/`Retry-After` header shape every other rate-limited route already returns.
- [ ] `npm run format`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass cleanly at the end of every phase below.

---

## Implementation phases

Each phase has one responsibility, can be reviewed and approved independently, and ends with the same four verification commands.

### Phase 7.1 — `search_history` schema and repository

- New migration + `db/schema/search-history.ts` (table definition only, matching the existing per-table schema-file convention).
- New `modules/discovery/search-history-repository.ts` (or equivalent): `recordSearch(userId, searchCacheId)` (upsert on `(user_id, search_cache_id)`, bumping `searched_at`), `listRecentSearches(userId, limit)` (joined with `search_cache` for display fields).
- No orchestration wiring, no route, no UI yet — this phase is the data layer only, independently testable against the schema/repository in isolation.
- Ends with: `npm run format`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

### Phase 7.2 — Wire search recording into the existing search flow

- `modules/discovery/search.ts`'s orchestration calls `recordSearch` after a successful search (cache hit or miss alike — the user still "ran" the search either way).
- No new route: this hooks into `POST /api/discovery/search`'s existing call path.
- No UI yet.
- Ends with: `npm run format`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

### Phase 7.3 — Recent Searches Dashboard UI

- Replace the Dashboard's placeholder card with a real read of `listRecentSearches`, following the page's existing "RSC reads directly" pattern (same as Saved Leads / Follow-ups due on the same page).
- Each entry links to Discovery with the search's params carried over (pre-filled form).
- Ends with: `npm run format`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

### Phase 7.4 — Extend the search response with `websiteUrl` and `leadScore`

- `modules/discovery/search.ts` / its repository layer adds a `leadScore` join (mirroring `modules/crm/favorites-repository.ts`'s existing `listLeadsByUser` join pattern) and surfaces the already-selected `websiteUrl`.
- `components/discovery/types.ts`'s `DiscoveryBusiness` gains both fields.
- No filter UI yet — this phase is the data/API layer only.
- Ends with: `npm run format`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

### Phase 7.5 — Discovery "Has website" and "Min. score" filters

- Two new controlled filter inputs in `discovery-view.tsx`, following the exact pattern the existing category/rating filters already use; extends the existing `filteredBusinesses` memo with two more predicates.
- Table View and Map View both continue to consume the one filtered array.
- Ends with: `npm run format`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

### Phase 7.6 — Force-refresh backend: `force` option + two new routes

- `getOrRefreshPlaceDetails` and `getOrRunWebsiteAnalysis` gain a `force?: boolean` parameter, bypassing the freshness check when set.
- New `POST /api/businesses/{id}/details` and `POST /api/businesses/{id}/analyze` routes, each: `requireSession`, path-param validated (reusing `idParamSchema` from Sprint 6 Phase 6.2), rate-limited (reusing `checkRateLimit`, a new bucket per route), calling the now-forceable orchestration functions.
- No UI yet.
- Ends with: `npm run format`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

### Phase 7.7 — Business Detail "Refresh" UI

- One new small client component: a "Refresh" button calling both new routes, disabled while in flight, surfacing a brief success/rate-limited/error state, then reflecting the updated data (either via `router.refresh()` or an equivalent re-fetch of the server-rendered content).
- Ends with: `npm run format`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

---

## Progress

- [ ] Not started.
