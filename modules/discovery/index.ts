/**
 * Business Discovery domain logic (architecture.md §4 "discovery/ —
 * search orchestration + signatures + dedup"). Table View, Map View,
 * and result filtering/sorting are a later Sprint 2 phase — this module
 * is orchestration + persistence, consumed by `/api/discovery/search`.
 */
export * from "./businesses-repository";
export * from "./lock";
export * from "./normalize";
export * from "./search";
export * from "./search-cache-repository";
export * from "./search-history-repository";
export * from "./signature";
