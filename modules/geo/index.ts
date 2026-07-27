/**
 * Free, keyless geo-data clients (architecture.md §7, migrated from
 * Google Maps Platform to OpenStreetMap): Nominatim for geocoding,
 * Overpass for business search and details. Replaces `modules/google`
 * one-for-one — same anti-corruption-layer role, same consumers
 * (`modules/discovery`, `modules/intelligence`), no API key required
 * by any function here.
 */
export * from "./errors";
export * from "./geocode";
export * from "./place-details";
export * from "./places-search";
export * from "./types";
