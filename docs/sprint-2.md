# Sprint 2 — Business Discovery

Source of truth: [architecture.md](./architecture.md) §17.

## Objectives

- Implement server-side Google clients for Places Search and Geocoding.
- Implement the staged manual search flow: Country → City → District → Category → Keyword.
- Implement the shared cache plane for discovery: `businesses` (Place-ID dedup) and `search_cache` (signatures, TTL), per §5–§6.
- Implement Cache-First read-through so repeated searches hit Postgres, not Google.
- Build the Table View (sortable, filterable, paginated, virtualized) and Map View (Google Maps JS, referrer-restricted key).
- Apply Postgres-backed rate limiting to the search endpoint.

## Deliverables

- `modules/google` clients: Places Search + Geocoding.
- Staged search UI and orchestration (`modules/discovery`).
- `businesses` table (Place ID dedup/upsert) and `search_cache` table (signature, TTL, expiry).
- Cache-First read-through logic (§6): fresh cache serves from Postgres; stale/miss calls Google and updates the cache.
- Table View: sort, filter, paginate, virtualize (TanStack Table + Virtual).
- Map View: Google Maps JS with markers, using the user's referrer-restricted browser key.
- Postgres-backed rate limiting on the search route.

**Working app milestone:** search real businesses, see them in table + map, with cached repeat searches.

## Progress

Sprint 2 is being built in phases; each phase's own scope is tracked
below rather than jumping straight to the sprint-level deliverables.

### Phase 2.1 — Google clients, cache schema, Cache-First core, repository layer

- [x] `modules/google` clients: Geocoding (`geocode.ts`) and Places Search
      (`places-search.ts`, Places API (New) `searchText` — chosen over the
      legacy Nearby/Text Search endpoints because it's field-mask-driven,
      per architecture.md §7.3). Both are pure HTTP clients with Zod-validated
      responses; no DB access, no caching logic of their own (anti-corruption
      layer, architecture.md §4).
- [x] `businesses` table (architecture.md §5.2, full column set including
      the Sprint-3-owned `phone` / `website_url` / `place_summary` /
      `details_fetched_at` / `details_expires_at`, left null for now) with
      the GIST(location), GIN(tsvector), and btree indexes from §5.4.
      `location` is a hand-written `geography(Point, 4326)` custom Drizzle
      type (`db/schema/columns.ts`) — drizzle-orm's built-in `geometry()`
      helper only emits `geometry`, not `geography`.
- [x] `search_cache` table (architecture.md §5.2, §5.4).
- [x] Migration `0002_enable_postgis_extension.sql` + `0003_sprint2_businesses_search_cache.sql`
      (the latter hand-corrected after generation — see the comment at
      the top of the file — `drizzle-kit` quoted the custom `geography`
      type as an identifier, which Postgres would reject).
- [x] Cache-First read-through (`modules/discovery/search.ts`,
      architecture.md §6.2): fresh `search_cache` row → serve from
      Postgres, no Google call; stale/miss → call Google within the same
      request, upsert, re-cache. Includes the §6.4 opportunistic bounded
      purge of expired `search_cache` rows on a miss (no cron).
- [x] Place ID deduplication: `businesses` upsert is keyed on the unique
      `google_place_id` column (`modules/discovery/businesses-repository.ts`),
      using `excluded.*` in the `ON CONFLICT` update so a batch upsert is
      correct, not just a single-row special case.
- [x] Repository layer: `modules/discovery/businesses-repository.ts`,
      `modules/discovery/search-cache-repository.ts`.
- [x] `modules/discovery/normalize.ts` + `signature.ts` — normalized
      search params and the stable signature hash the cache keys on
      (architecture.md §6.3), needed to make the Cache-First path
      testable/callable at all.

**Deliberately not in Phase 2.1** (later Sprint 2 phases): staged search
UI, `/api/discovery/search` Route Handler, Table View, Map View,
Postgres-backed rate limiting on search. `modules/discovery/search.ts`
is ready to be called from a Route Handler once one exists.

**Verification:** `npm run format`, `npm run lint`, `npx tsc --noEmit`,
and `npm run build` all pass. The hand-written EWKB point parser
(`db/schema/columns.ts`) was verified against known-correct encoded
values with a standalone script (round-trips lat/lng correctly, with
and without an embedded SRID). As in Sprint 1, no live Postgres was
available in this sandbox, so the actual upsert/cache-read SQL against
a real PostGIS-enabled database is unverified beyond typecheck + review
— worth a manual pass (`npm run db:migrate`, then a scripted call to
`searchBusinesses`) against a real database before Phase 2.2 assumes
this layer works end-to-end.

### Remaining Sprint 2 phases

- [ ] Staged search UI + `/api/discovery/search` Route Handler.
- [ ] Table View (sort/filter/paginate/virtualize).
- [ ] Map View (Google Maps JS, referrer-restricted key).
- [ ] Postgres-backed rate limiting on the search route.
