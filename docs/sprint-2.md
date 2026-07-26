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

- [ ] Not started.
