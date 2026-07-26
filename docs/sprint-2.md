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

### Phase 2.2 — `/api/discovery/search`, request validation, pagination, rate limiting, idempotency

- [x] `POST /api/discovery/search` (architecture.md §12.5) — the staged
      search flow (Country/City/District/Category/Keyword) as a thin
      Route Handler over `modules/discovery/search.ts`, following the
      response envelope from §12.2 (`{ data, meta, request_id }` /
      `{ error, request_id }`).
- [x] Request validation: `lib/validation/discovery.ts`
      (`searchRequestSchema`) — Zod at the boundary (architecture.md
      §13.3), separate from `modules/discovery/normalize.ts`'s
      canonicalization (rejecting bad input vs. collapsing equivalent
      good input are different concerns).
- [x] Search signatures + cache lookup + Google fallback: unchanged from
      Phase 2.1 (`modules/discovery/search.ts`), now actually reachable
      from an HTTP boundary.
- [x] Pagination (architecture.md §8, §12.3): `cursor`/`pageSize` in the
      request body, `meta.next_cursor` in the response. When a page
      request reaches past what's cached, `modules/discovery/search.ts`
      fetches one more Places Search page using the `nextPageToken`
      stored on `search_cache.provider_page_tokens` (§8 "'load more' can
      extend a cached search without restarting it") and appends it —
      `modules/google/places-search.ts` now supports continuing a search
      via `pageToken` as well as starting one via `textQuery`.
- [x] Search rate limiting: `lib/rate-limit/index.ts` — a Postgres-backed
      fixed-window limiter (architecture.md §12.4) using the existing
      `rate_limits` table (atomic `INSERT ... ON CONFLICT DO UPDATE
... RETURNING count`), bucketed as `"discovery.search"`, `20`
      requests per `60s` (`config/constants.ts`, tunable). Exhaustion
      returns `429` + `Retry-After`; every response carries
      `X-RateLimit-*` headers.
- [x] Idempotency (architecture.md §12.4), **implemented as literally
      specified** — a client-supplied `Idempotency-Key` header; the
      first successful response is stored and replayed verbatim on a
      repeat with the same key, so Google is never called twice for the
      same attempt (`lib/idempotency/index.ts`, wired into the Route
      Handler). This revises the first version of Phase 2.2, which
      argued the search signature + an advisory lock already satisfied
      §12.4's intent and skipped the header entirely — on review, that
      was a real deviation from the spec (different retry semantics, no
      cross-action reuse for the analyze/AI actions §12.4 also names,
      no literal response replay), not an equivalent implementation.
      Concretely:
  - `idempotency_keys` — a new table, added to `docs/architecture.md`
    §5.2/§5.4/§6.1 as part of this change rather than left undocumented,
    since no existing table (`rate_limits`, `audit_logs`) is shaped for
    a keyed response payload with its own short expiry, and Vercel
    functions are stateless per invocation (no in-memory option).
    `(user_id, bucket, key)` unique; `bucket` scopes a key to one action
    so the table is reusable for `business.analyze` / `ai.audit` later.
    `request_hash` detects a key reused for a different request body
    (409 Conflict, not a mismatched replay).
  - Only **successful** (2xx) responses are stored — a failed attempt
    (validation error, missing Google key, rate limited, upstream
    failure) stays freely retryable under the same key.
  - A replay is checked **before** rate limiting, so it costs nothing
    against the caller's quota — it isn't a new action.
  - TTL is 24h (`IDEMPOTENCY_KEY_TTL_HOURS`, `config/constants.ts`) —
    "short," per §12.4, not `search_cache`'s multi-day window; same
    opportunistic-purge-on-read pattern as everything else in §6.4.
  - The Phase 2.1 advisory lock (`modules/discovery/lock.ts`) is
    **kept**, per instruction, as an internal concurrency-control
    detail — it now composes with the Idempotency-Key layer rather than
    substituting for it. The two guard different failures: the lock
    stops _any_ concurrent caller (same client or not, with or without
    a key) from double-spending on the _same search content_;
    Idempotency-Key stops _one client's own retry_ of _one specific
    call_. A client that reuses a key for an identical search is
    protected twice, redundantly but harmlessly; a client that doesn't
    send a key at all still gets the lock's protection, same as before.

**Deliberately not in Phase 2.2** (later Sprint 2 phases): Table View,
Map View, any UI, result filtering, result sorting.

**Verification:** `npm run format`, `npm run lint`, `npx tsc --noEmit`,
and `npm run build` all pass, both for the initial Phase 2.2 pass and
after the Idempotency-Key revision (migration
`0004_idempotency_keys.sql` generated cleanly, no manual fix needed
this time). HTTP-smoke-tested against a running dev server: an
unauthenticated `POST /api/discovery/search` correctly returns `401`
with the standard error envelope, including when an `Idempotency-Key`
header is present (the auth check still short-circuits before any
idempotency logic runs). The authenticated path — real search, cache
write, pagination extension, rate-limit exhaustion, idempotent replay,
key-reuse conflict, concurrent-request lock behavior — is unverified
beyond typecheck + review; no live Postgres or Google API key is
available in this sandbox. Worth a manual pass against a real database
and a real Google API key before Phase 2.3 (Table/Map View) builds a UI
on top of this endpoint.

### Phase 2.3 — Discovery page UI, DataTable, pagination UI, row selection

- [x] Discovery page: `app/(dashboard)/discovery/page.tsx` — a thin RSC
      shell (auth already gated by `app/(dashboard)/layout.tsx`, which
      now also links to it) rendering `components/discovery/discovery-view.tsx`,
      a client component owning the staged search form (Country/City/
      District/Category/Keyword — `district` and `keyword` optional,
      matching `lib/validation/discovery.ts`), cursor state, and row
      selection. Calls `POST /api/discovery/search` directly with the
      browser's own `fetch` (same-origin, so the session cookie is sent
      automatically) — no server action, no new endpoint, per
      instruction ("the table must consume the existing discovery
      API").
- [x] `@tanstack/react-table` + `@tanstack/react-virtual` (architecture.md
      §14, §19) — installed and used together in `components/data-table/data-table.tsx`.
- [x] Reusable `DataTable` component (`components/data-table/data-table.tsx`)
      — generic over row type, presentation-only (no fetching, no
      sort/filter model). Renders as ARIA `role="table"/"row"/"cell"`
      `div`s rather than a semantic `<table>`, because virtualized rows
      need `position: absolute`, which is invalid on `<tr>` — a
      `gridTemplateColumns` computed from each column's `size` keeps the
      sticky header and virtualized body rows aligned.
- [x] Column definitions: `components/discovery/columns.tsx`
      (`discoveryColumns: ColumnDef<DiscoveryBusiness>[]`) — a selection
      checkbox column plus Name/Category/City/District/Rating/Address,
      covering exactly the fields Sprint 2 actually populates (no
      Phone/Website columns — those stay null until Sprint 3's Place
      Details). No `accessorFn`-driven sort comparators or filter
      predicates attached, since sorting/filtering are out of scope.
- [x] Loading state: skeleton rows (`DataTable`, shown while
      `isLoading && data.length === 0`).
- [x] Empty state: dashed-border placeholder, shown for a genuine
      zero-result search — distinct from the "haven't searched yet"
      placeholder `DiscoveryView` shows before the first submit.
- [x] Error state: an `role="alert"` panel showing the API's error
      message — except `GOOGLE_API_KEY_MISSING`, which `DiscoveryView`
      intercepts and renders as an inline message linking to
      `/settings` (Sprint 1's Settings page) instead of a generic table
      error, since it's directly actionable.
- [x] Cursor pagination UI: `components/data-table/data-table-pagination.tsx`
      — Previous/Next, "Showing X–Y of Z" (`+` when a `next_cursor`
      means more exist). "Previous" is offered even though the API only
      ever returns a forward cursor: stepping back re-issues the same
      search at a lower offset, which is a `search_cache` hit for
      anything already fetched (architecture.md §6.2) — never a new
      Google call.
- [x] Row selection: `components/ui/checkbox.tsx` (new — `@base-ui/react/checkbox`,
      matching the existing Button/Input/Label primitives' pattern) +
      TanStack Table's built-in `rowSelection` state, lifted to
      `DiscoveryView` (`getRowId` keyed on `business.id`, so selection
      survives a page's data changing identity). A "N selected" line
      appears above the table; there's no bulk action to attach it to
      yet (favorites is Sprint 4), so this phase only proves selection
      state works.
- [x] Responsive layout: search form wraps top-to-bottom on narrow
      viewports (`flex-col`) and to a single wrapped row on `sm:`+; the
      table's own scroll container (`overflow-auto`) handles narrow
      viewports by scrolling horizontally rather than squeezing columns.

**Deliberately not in Phase 2.3** (later Sprint 2 phases, per
instruction): Google Maps / Map View, result filtering, result sorting,
a business detail page, favorites, notes.

**Addendum — `DataTable` genericity review.** Before starting Google
Maps, reviewed whether `DataTable`/`DataTablePagination` could be
reused for Favorites, Lead lists, Follow-up lists, and AI opportunity
lists (Sprint 4/5) without modification. Answer was "not quite" — three
real coupling points, now fixed:

- `rowSelection`/`onRowSelectionChange` were required props with
  `enableRowSelection: true` hardcoded, forcing every future consumer
  (including a purely read-only list) to wire up selection state. Both
  are now optional; `enableRowSelection` is derived from whether they
  were passed.
- Row height was a fixed internal constant. Discovery's rows are
  single-line, but Lead lists / AI opportunity lists showing notes or
  status badges likely won't be. Now `estimatedRowHeight?: number`
  (default 44).
- `DataTablePagination`'s props were named around "cursor"
  (`cursor`, `totalCached`) — accurate for Discovery, but architecture.md
  §12.3 specifies **offset** pagination for small bounded user lists
  (favorites, lead lists) as distinct from **cursor** pagination for
  `businesses`. Mechanically both are just numeric page windows, so the
  component didn't need to change behavior — only its public names,
  which are now neutral (`pageStart`, `totalCount`). Discovery's own
  state variables keep their architecture-accurate names
  (`cursor`, `totalCached`) in `discovery-view.tsx`; only the shared
  component's prop names changed.

**Verification:** `npm run format`, `npm run lint`, `npx tsc --noEmit`,
and `npm run build` all pass (lint has one benign warning — React
Compiler flags `useReactTable()` as returning functions it can't safely
memoize, a known, documented interaction with TanStack Table, not a
defect). HTTP-smoke-tested against a running dev server:
`GET /discovery` unauthenticated correctly redirects to `/sign-in`
(307), same as every other `(dashboard)` route. Per this project's
standing instruction not to use browser automation, the actual
rendered UI — table virtualization at scroll, loading/empty/error
states, checkbox selection, responsive breakpoints — has **not** been
visually verified in a browser and is unverified beyond typecheck +
code review. Worth an actual manual click-through (ideally against a
real database + Google API key, so real search results populate the
table) before Sprint 3 assumes this page works end-to-end.

### Remaining Sprint 2 phases

- [ ] Map View (Google Maps JS, referrer-restricted key).
- [ ] Result filtering.
- [ ] Result sorting.
