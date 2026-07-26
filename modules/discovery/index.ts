/**
 * Business Discovery domain logic (architecture.md §4 "discovery/ —
 * search orchestration + signatures + dedup"). Staged search UI,
 * Table/Map View, and the `/api/discovery/search` Route Handler are a
 * later Sprint 2 phase — this module is orchestration + persistence
 * only.
 */
export * from "./businesses-repository";
export * from "./normalize";
export * from "./search";
export * from "./search-cache-repository";
export * from "./signature";
