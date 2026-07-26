/**
 * Cache TTLs (architecture.md §6.1) — centralized so every module reads
 * the same tunable windows instead of scattering magic numbers. More
 * are added here as later sprints introduce their own cached data
 * (Place Details, website analyses, ...).
 */

/** §6.1 "Search results (Place ID list for a query) | 7–14 days (configurable)". */
export const SEARCH_CACHE_TTL_DAYS = 7;
