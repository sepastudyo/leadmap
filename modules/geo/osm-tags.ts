/**
 * Small helpers shared by `places-search.ts` and `place-details.ts` for
 * interpreting OpenStreetMap tags — kept here rather than duplicated in
 * both, since both need the same "what kind of place is this" and
 * "what's its address" logic from the same raw `tags` object.
 */

/**
 * OSM's own vocabulary for "what kind of place is this" is spread
 * across several top-level keys rather than one unified "category"
 * field the way Google's `primaryType` is. Checked in a fixed order —
 * the first one present wins — covering the categories a marketing
 * agency would realistically search for (restaurants/cafes/shops/
 * offices/trades/hotels/gyms/clinics).
 */
const OSM_TYPE_TAG_KEYS = [
  "amenity",
  "shop",
  "office",
  "craft",
  "tourism",
  "leisure",
  "healthcare",
] as const;

export function extractPrimaryType(
  tags: Record<string, string> | undefined,
): string | null {
  if (!tags) return null;
  for (const key of OSM_TYPE_TAG_KEYS) {
    const value = tags[key];
    if (value) return value;
  }
  return null;
}

/**
 * OSM's address tags (`addr:housenumber`, `addr:street`, `addr:city`,
 * `addr:postcode`) are each optional and independently present —
 * unlike Google's single `formattedAddress` string, there's no
 * guarantee any of them exist on a given element. Builds the best
 * available line from whatever is present; `businesses.address` is
 * `NOT NULL`, so a fallback covers the (common, for OSM) case where an
 * element has no address tags at all.
 */
export function buildFormattedAddress(
  tags: Record<string, string> | undefined,
  fallback: string,
): string {
  if (!tags) return fallback;

  const line = [
    [tags["addr:housenumber"], tags["addr:street"]]
      .filter((part): part is string => Boolean(part))
      .join(" "),
    tags["addr:city"],
    tags["addr:postcode"],
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");

  return line || fallback;
}

/** Regex-escapes free text before it's interpolated into an Overpass
 * QL regex-value filter — the same "don't let user input reinterpret
 * the query language" discipline as any other embedded-language
 * boundary in this codebase. */
export function escapeOverpassRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
