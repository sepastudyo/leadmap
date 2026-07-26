/**
 * Cache TTLs (architecture.md §6.1) — centralized so every module reads
 * the same tunable windows instead of scattering magic numbers. More
 * are added here as later sprints introduce their own cached data
 * (Place Details, website analyses, ...).
 */

/** §6.1 "Search results (Place ID list for a query) | 7–14 days (configurable)". */
export const SEARCH_CACHE_TTL_DAYS = 7;

/**
 * Search pagination (architecture.md §8, §12.3). Capped at 20 — Google's
 * Places API (New) `searchText` returns ~20 results per page, so a page
 * request never needs more than one page-token extension to satisfy it.
 */
export const SEARCH_PAGE_SIZE_DEFAULT = 20;
export const SEARCH_PAGE_SIZE_MAX = 20;

/**
 * Postgres-backed fixed-window rate limit for the search route
 * (architecture.md §12.4 "Tighter buckets on expensive actions
 * (search, analyze, AI)"). No number is specified in architecture.md;
 * this is a starting point, tunable without a schema change.
 */
export const SEARCH_RATE_LIMIT_MAX = 20;
export const SEARCH_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * §12.4 "the first result is stored briefly and replayed on retry" —
 * long enough to cover realistic client retries (a page reload, a
 * mobile client resuming after a dropped connection), short because
 * this is a safety net, not a cache (see architecture.md §6.1's
 * Idempotency-Key row).
 */
export const IDEMPOTENCY_KEY_TTL_HOURS = 24;

/** §6.1 "Place Details (name/phone/website/hours) | ~30 days (ToS-bounded)". */
export const PLACE_DETAILS_TTL_DAYS = 30;
