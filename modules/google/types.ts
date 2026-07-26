/**
 * Shared primitive for `modules/google` — kept local rather than
 * imported from `db/schema` so this module stays a framework/DB-free
 * anti-corruption layer (architecture.md §4: "a provider change touches
 * one folder"). Structurally identical to `db/schema/columns`'s
 * `LatLng`; callers that persist a result pass it straight into the
 * `businesses.location` column, which accepts the same `{ lat, lng }`
 * shape.
 */
export type LatLng = { lat: number; lng: number };
