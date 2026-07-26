# Sprint 3 — Business Intelligence

Source of truth: [architecture.md](./architecture.md) §17.

## Objectives

- Implement Place Details enrichment with ToS-compliant caching TTLs.
- Build the Website Analysis pipeline (HTTP-only, staged, SSRF-guarded) per §9.
- Build the modular, data-driven Lead Score engine and seed scoring ruleset per §10.
- Build the business detail page presenting analysis, explainable score, and Google Business signals.

## Deliverables

- Place Details enrichment (cached in `businesses.place_summary`, ~30-day TTL).
- Website Analysis pipeline: acquire (SSRF-guarded fetch) → parse (Cheerio) → metadata/SEO/CMS/tracking/social/schema-OG stages → robots.txt/sitemap.xml → SSL → assemble/validate → persist to `website_analyses`.
- SSRF guards: private/link-local/metadata IP blocking, redirect cap, size cap, timeout.
- Lead Score engine: `scoring_rules` + `scoring_rulesets` tables, sandboxed expression evaluator, explainable `breakdown`, versioned scoring via `lead_scores`.
- Seed scoring ruleset (initial published version).
- Business detail page: analysis results, explainable Lead Score, Google Business signals (rating, review count, category, presence).

**Working app milestone:** open a business, run analysis, get an explainable Lead Score.

## Progress

Sprint 3 is being built in phases, same pattern as Sprint 2 (see
docs/sprint-2.md) — each phase's scope tracked here rather than jumping
straight to the sprint-level deliverables.

### Phase 3.1 — Place Details client, repository, enrichment, TTL/refresh

- [x] Google Place Details API integration + client
      (`modules/google/place-details.ts`) — same API family and
      conventions as Sprint 2's `places-search.ts` (Places API (New),
      `X-Goog-Api-Key` + `X-Goog-FieldMask` headers, for the same §7.3
      field-mask reason). Field mask requests exactly what architecture.md
      §7.1 names for this API — phone, website, hours, category — plus
      `id`/`displayName` for identity; nothing else (no ratings/photos/
      reviews, which are Places Search's job and already cached).
- [x] Place Details repository: extended
      `modules/discovery/businesses-repository.ts` (Sprint 2's existing
      repository, per instruction — "Reuse the existing repository
      pattern established in Sprint 2") with `getBusinessById` (lookup
      by internal `id`, distinct from the batch-by-`google_place_id`
      lookup discovery already had) and `updatePlaceDetailsForBusiness`.
      The two write paths stay strictly partitioned: `upsertBusinesses`
      (Sprint 2) never touches `phone`/`website_url`/`place_summary`/
      `details_fetched_at`/`details_expires_at`; `updatePlaceDetailsForBusiness`
      (Sprint 3) never touches the discovery columns (`name`, `address`,
      `country`/`city`/`district`, `location`, `google_rating`,
      `google_review_count`) — each sprint's write path is scoped to the
      columns it owns, so neither can clobber the other's data on the
      same row. This is what preserves Sprint 2 backward compatibility:
      nothing about how discovery upserts businesses changed.
- [x] Businesses enrichment + TTL/refresh logic:
      `modules/intelligence/place-details.ts` (`getOrRefreshPlaceDetails`)
      — a lazy read-through matching architecture.md §6.2 exactly: a
      fresh row (`details_expires_at` in the future) serves from
      Postgres with no Google call; a stale/missing one calls Google
      within the same request, persists via the repository, and returns
      the updated row. TTL is 30 days (`PLACE_DETAILS_TTL_DAYS`,
      `config/constants.ts`), matching §6.1's "~30 days (ToS-bounded)."
      `place_summary` currently holds `{ hours: string[] | null }` — the
      one Place Details field §7.1 names that has no dedicated column.
- [x] Database updates: **none required.** `businesses.phone` /
      `website_url` / `place_summary` / `details_fetched_at` /
      `details_expires_at` were already part of the table's full §5.2
      column set from Sprint 2 Phase 2.1 (built ahead of need
      specifically so Sprint 3 wouldn't require a migration — see that
      phase's notes in docs/sprint-2.md). Confirmed no schema drift:
      `db/schema/` and `db/migrations/` are untouched by this phase.
- [x] Cache integration with the existing discovery flow: the
      enrichment functions read and write the _same_ `businesses` rows
      Sprint 2's search flow creates (matched by the same `id`/
      `google_place_id`), through the same repository module, using the
      same `DbClient`-optional pattern (`modules/discovery/businesses-repository.ts`
      already had this from the Idempotency-Key phase's threading work).
      What this phase deliberately does **not** do is call Place Details
      automatically during a search: architecture.md §3 frames
      enrichment as happening "on opening a business" (a per-business,
      on-demand action), and §7.3 ties Google spend to "genuinely new
      searches" — auto-enriching all `SEARCH_PAGE_SIZE_MAX` (20) results
      per search would multiply Google Places calls 20x per search and
      contradict both. `getOrRefreshPlaceDetails` is exported and ready
      to be called from a business detail page or Route Handler in a
      later Sprint 3 phase — nothing currently calls it yet, matching
      how Phase 2.1 built `modules/discovery/search.ts`'s orchestration
      before any Route Handler existed to call it.

**Deliberately not in Phase 3.1** (later Sprint 3 phases, per
instruction): Website Analyzer, AI, Lead Scoring, Business Detail Page,
any CRM feature (favorites/notes — Sprint 4 regardless). No new Route
Handler either — matching the Sprint 2 precedent of separating
orchestration (Phase 2.1) from its HTTP surface (Phase 2.2), the same
split applies here.

**Verification:** `npm run format`, `npm run lint`, `npx tsc --noEmit`,
and `npm run build` all pass (the one pre-existing benign React
Compiler / TanStack Table warning, unrelated to this phase). No live
Postgres or Google API key is available in this sandbox (same
limitation noted throughout Sprint 2), so `getOrRefreshPlaceDetails`'s
actual behavior against a real database and a real Place ID is
unverified beyond typecheck + code review — worth a manual pass once a
caller exists to exercise it end-to-end.
