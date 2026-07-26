import { createHash } from "node:crypto";

import type { NormalizedSearchInput } from "./normalize";

/**
 * Stable hash of normalized search params (architecture.md §6.3:
 * "each search is reduced to a normalized signature — a hash of
 * {country, city, district, category, keyword} after
 * trimming/lowercasing/canonicalizing"). Field order in the canonical
 * JSON is fixed explicitly (not just object insertion order) so the
 * signature never silently changes if this type's field order ever
 * does.
 */
export function computeSearchSignature(
  normalized: NormalizedSearchInput,
): string {
  const canonical = JSON.stringify([
    normalized.country,
    normalized.city,
    normalized.district,
    normalized.category,
    normalized.keyword,
  ]);

  return createHash("sha256").update(canonical).digest("hex");
}
