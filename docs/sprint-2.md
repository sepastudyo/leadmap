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

### Phase 2.4 — Google Maps JS integration, Map View

- [x] Google Maps JavaScript API integration: `@googlemaps/js-api-loader`
      (Google's official loader), using its current functional API
      (`setOptions`/`importLibrary`) — the class-based `Loader` the
      package also exports is marked deprecated in its own types, so
      that older pattern was deliberately not used.
- [x] Map View: `components/discovery/map-view.tsx`, toggled against
      Table View via a Table/Map switch in `discovery-view.tsx`
      (architecture.md §3 "Table View ... and a Map View").
- [x] Marker rendering: classic `google.maps.Marker`, one per business,
      `title` set to the business name; click opens an `InfoWindow`
      built from `document.createElement`/`textContent` (not
      `innerHTML` — business name/category ultimately come from
      Google's API response, which §13.3 treats as untrusted, so this
      closes off any injection vector regardless of how unlikely).
      `AdvancedMarkerElement` (Google's newer, recommended marker API)
      was deliberately not used — it requires a Map ID configured in
      Google Cloud Console, which has no field anywhere in this app's
      settings model (§5.2); classic `Marker` needs no such setup and
      remains fully supported.
- [x] Table ↔ map synchronization: `MapView` receives the exact same
      `businesses` array `DiscoveryView` already passes to `DataTable`
      — a new search, a page change, anything that updates that one
      array flows into both views through props, with no second fetch
      and no separate copy of business state.
- [x] Selected row ↔ selected marker synchronization: `MapView` also
      receives the same `rowSelection` state and `onRowSelectionChange`
      setter the table uses. A selected row's marker renders with a
      distinct icon (blue vs. the default red pin); clicking a marker
      toggles that same row's entry in `rowSelection` — one shared
      selection model, read and written from both views, not two
      models kept in sync.
- [x] Map viewport persistence: center + zoom written to
      `sessionStorage` (`leadmap:discovery:map-viewport`) on the map's
      `idle` event, restored on init. Combined with `MapView` staying
      mounted (CSS-hidden, not unmounted) once first opened — see lazy
      loading below — the viewport also survives Table/Map toggles and
      new searches within a session, not just page reloads. On a truly
      fresh session (nothing stored yet), the map fits bounds to the
      current results once; it doesn't re-fit on every subsequent
      search, so it doesn't yank a view the user has already adjusted.
- [x] Lazy loading of the Maps bundle: `MapView` is imported via
      `next/dynamic(() => import("./map-view"), { ssr: false })` in
      `discovery-view.tsx`, and that dynamic import is only ever
      referenced once `hasOpenedMap` becomes true — i.e. the first time
      the user clicks the Map tab. Neither `MapView`'s own code nor the
      actual Google Maps JS bundle it triggers (`importLibrary` calls
      inside it) downloads for a session that never opens Map View.
- [x] Browser API key usage exactly as defined in §7: a new, narrow,
      dedicated endpoint (`GET /api/discovery/maps-key`) is the only
      code path that returns the Google API key to the client, and it
      returns _only_ `{ googleApiKey }` — nothing else from
      `user_settings`. The server-side key used by
      `modules/discovery/search.ts` for Places/Geocoding is decrypted
      in a completely separate code path that never constructs an HTTP
      response containing it. `MapView` calls this endpoint once, on
      init, and feeds the result straight into `setOptions()` — it's
      never logged, stored beyond the component's own closure, or
      echoed back in any other response. Per §7.2, this key reaching
      the browser is not a leak: Maps JS keys are "exposed to the
      client by necessity," and the security boundary is the
      HTTP-referrer restriction the user configures in Google Cloud
      Console, not secrecy on our side. This app's schema (Sprint 1)
      stores one Google API key, not the separate server/browser pair
      §7.2 also describes as supported — so today that one key is both
      the server key `modules/discovery/search.ts` uses and the value
      this endpoint hands to the browser. That's the "one
      appropriately-restricted key" configuration §7.2 explicitly
      endorses, not a workaround; a second, browser-only key field
      isn't implied by anything in this phase's instructions and would
      be new Settings-page scope, not Map View scope.
- [x] Clustering: not implemented. Each page holds at most
      `SEARCH_PAGE_SIZE_MAX` (20) businesses, and the map only ever
      renders the current page's markers — nowhere near the marker
      count where clustering earns its complexity, so it isn't
      technically required (per instruction, "unless technically
      required").

**Deliberately not in Phase 2.4** (later Sprint 2 phases or later
sprints, per instruction): business detail page, favorites, notes, AI,
website analysis, Place Details, result filtering, result sorting.

**Verification:** `npm run format`, `npm run lint`, `npx tsc --noEmit`,
and `npm run build` all pass (same one benign React Compiler /
TanStack Table warning as Phase 2.3, plus a `react-hooks/exhaustive-deps`
ref-in-cleanup warning that was fixed properly — the ref's `Map` object
is captured into a local variable before the effect's cleanup closure
reads it — rather than suppressed). HTTP-smoke-tested against a running
dev server: `GET /api/discovery/maps-key` unauthenticated correctly
returns `401`, and `GET /discovery` unauthenticated still redirects to
`/sign-in`. As with Phase 2.3, the actual rendered map — marker
placement, click-to-select, InfoWindow content, viewport persistence
across a real reload, referrer-restriction behavior with a real
Google Maps key — has **not** been visually verified in a browser (per
this project's standing instruction against browser automation) and is
unverified beyond typecheck + code review. This is the piece of Sprint
2 most worth a real manual pass before relying on it: it's the first
code in this project that talks to a live third-party JS SDK in the
browser, and the failure modes (a misconfigured referrer restriction,
an `importLibrary` version mismatch, a marker icon URL going stale)
aren't things typecheck can catch.

### Final review — closing the sort/filter gap

A final pass against architecture.md §17 ("**Table View** (filter/sort/
paginate/virtualize)") and §8 ("TABLE VIEW sortable · filterable")
found one real gap: Phases 2.3 and 2.4 were both explicitly scoped to
exclude sorting and filtering ("Do NOT implement: ... filters,
sorting"), which was the right call for keeping those phases reviewable
— but sort/filter are Sprint 2 deliverables in architecture.md, not a
later sprint's, so Sprint 2 wasn't actually done until they existed.
Closed here, still Sprint-2-scoped (no new API surface):

- [x] Sorting: `DataTable` gained optional `sorting`/`onSortingChange`
      props (`getSortedRowModel`, mirroring the row-selection opt-in
      pattern already established — omit both to disable sorting
      table-wide regardless of any column's own `enableSorting`).
      Sortable column headers are clickable, with a lucide
      `ArrowUp`/`ArrowDown`/`ArrowUpDown` indicator and
      `aria-sort`. Enabled on every `discoveryColumns` entry except the
      selection checkbox. The `rating` column needed an explicit
      `accessorFn` (it only had a custom `cell` before, so TanStack had
      nothing to sort by) — worth noting: TanStack's `sortUndefined`
      option checks `=== undefined`, not `null`, so the accessor
      normalizes the DB's `null` rating to `undefined` for that to work;
      unrated businesses sort last in either direction.
- [x] Filtering: category (substring, case-insensitive) and minimum
      rating (3+/4+/4.5+), added as controls in `discovery-view.tsx`.
      Client-side over the current page's already-fetched results, per
      §8 "client-side for the current page" — no new query parameters,
      no change to `/api/discovery/search`. The filtered array is
      computed once (`useMemo`) and passed to **both** `DataTable` and
      `MapView`, so map markers and table rows are always the same
      filtered set — extending "the table and the map must consume the
      same source of truth" (Phase 2.4's instruction) to cover this new
      derived state too, not just the raw search results.
      `has-website`/`score band`/`distance` — the other three filters
      §8 names — are **not** implemented: `has-website` needs
      `businesses.website_url` (always null until Sprint 3 Place
      Details), `score band` needs `lead_scores` (doesn't exist until
      Sprint 3's Lead Score engine), and `distance` needs a reference
      point (user location or a map center) that no part of this app
      currently captures. These are data-availability gaps inherited
      from Sprint 2's own scope boundary (no Place Details, no scoring),
      not an oversight — filed as Sprint 3 follow-ups below.

**Verification:** `npm run format`, `npm run lint`, `npx tsc --noEmit`,
and `npm run build` all pass (same one benign React Compiler / TanStack
Table warning as every prior phase). Confirmed no test suite exists in
this repo (`package.json` has no `test` script, no test framework is a
dependency) — consistent with none having been a deliverable in Sprint
1 or Sprint 2, so there was nothing to run. HTTP-smoke-tested the
auth-gated routes touched by Sprint 2 one more time:
`GET /discovery` and `GET /api/discovery/maps-key` both correctly
reject unauthenticated requests. As with every phase before it, the
actual rendered sort/filter interaction has not been visually verified
in a browser (per this project's standing instruction against browser
automation) — see "Manual verification recommended before Sprint 3"
below for the consolidated list.

## Sprint 2 — Final status: complete

Every item in architecture.md §17's Sprint 2 line and §8's discovery
flow is implemented: Google clients, staged search, `businesses` +
`search_cache` with Cache-First read-through and Place ID dedup, a
sortable/filterable/paginated/virtualized Table View, a Map View with
markers and the referrer-restricted browser key, and Postgres-backed
rate limiting on search. Idempotency (§12.4) is implemented as
literally specified after the Phase 2.2 revision. See the Sprint 2
completion report delivered alongside the `sprint-2-complete` tag for
the full implemented/excluded/technical-debt/manual-verification
breakdown.
