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

/**
 * Website Analysis acquisition pipeline (architecture.md §9.1 [1
 * Acquire]: "cap redirects, cap response size, enforce timeout"; §13.5
 * P0 SSRF control: "cap redirects, cap size, enforce timeouts"). No
 * exact numbers are specified in architecture.md; these are
 * conservative starting points sized to fit comfortably within a
 * serverless function's time/memory budget (§18 "Serverless function
 * time budget is the tightest real constraint"), tunable without a
 * schema change.
 */
export const ANALYZER_TIMEOUT_MS = 8_000;
export const ANALYZER_MAX_REDIRECTS = 5;
export const ANALYZER_MAX_RESPONSE_BYTES = 2_000_000;
/** §9.1 "descriptive User-Agent". */
export const ANALYZER_USER_AGENT =
  "Mozilla/5.0 (compatible; LeadMapAnalyzer/1.0; +https://github.com/sepastudyo/leadmap)";

/**
 * SEO analysis (architecture.md §9.2 "SEO (basic): title/description
 * quality"). Not specified in architecture.md — these are conventional
 * SEO guidelines (title ~50-60 characters, meta description ~120-160
 * before search engines truncate them), tunable without a schema
 * change.
 */
export const SEO_TITLE_MIN_LENGTH = 10;
export const SEO_TITLE_MAX_LENGTH = 60;
export const SEO_DESCRIPTION_MIN_LENGTH = 50;
export const SEO_DESCRIPTION_MAX_LENGTH = 160;

/** §9.1 [12 Assemble] "analyzer_version" — stamped on every persisted
 * `website_analyses` row so a future analyzer change is distinguishable
 * from the data it produced under an older version. Bump manually when
 * a stage's extraction logic changes in a way that could change output
 * for the same input page. */
export const ANALYZER_VERSION = "1.0.0";

/** §6.1 "Website analysis | website_analyses + expires_at | 30–90 days
 * (our data)" — the midpoint of that range; our own derived data, so a
 * longer TTL is fine, tunable without a schema change. */
export const WEBSITE_ANALYSIS_TTL_DAYS = 60;
