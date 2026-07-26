import "server-only";

import { SEARCH_CACHE_TTL_DAYS } from "@/config/constants";
import { geocode, searchPlaces } from "@/modules/google";
import { getDecryptedKeys } from "@/modules/settings";

import {
  getBusinessesByPlaceIds,
  upsertBusinesses,
} from "./businesses-repository";
import { normalizeSearchInput, type SearchInput } from "./normalize";
import {
  getFreshSearchCache,
  purgeExpiredSearchCache,
  upsertSearchCache,
} from "./search-cache-repository";
import { computeSearchSignature } from "./signature";

/**
 * Cache-First staged search orchestration (architecture.md §2 request
 * lifecycle, §6, §8). This is the one place that decides "serve from
 * Postgres" vs. "call Google" — callers (a future Route Handler) just
 * provide the signed-in user and their staged search input.
 */

export class GoogleApiKeyMissingError extends Error {
  constructor() {
    super("Save a Google API key in Settings before searching.");
    this.name = "GoogleApiKeyMissingError";
  }
}

/** Places Search `locationBias` radius around the geocoded area center. */
const DEFAULT_SEARCH_RADIUS_METERS = 15_000;

export type SearchBusinessesResult = {
  businesses: Awaited<ReturnType<typeof getBusinessesByPlaceIds>>;
  fromCache: boolean;
};

export async function searchBusinesses(
  userId: string,
  input: SearchInput,
): Promise<SearchBusinessesResult> {
  const settings = await getDecryptedKeys(userId);
  if (!settings) throw new GoogleApiKeyMissingError();
  const googleApiKey = settings.googleApiKey;

  const normalized = normalizeSearchInput(input);
  const signature = computeSearchSignature(normalized);

  // §6.2 "Fresh (expires_at > now): serve from Postgres. No external call."
  const cached = await getFreshSearchCache(signature);
  if (cached) {
    const cachedBusinesses = await getBusinessesByPlaceIds(
      cached.placeIds as string[],
    );
    return { businesses: cachedBusinesses, fromCache: true };
  }

  // §6.2 "Stale (expires_at <= now): perform the external call within
  // the same user request ... 'refresh' naturally coincides with the
  // next user who needs the data."
  await purgeExpiredSearchCache();

  const areaQuery = [normalized.district, normalized.city, normalized.country]
    .filter((part): part is string => Boolean(part))
    .join(", ");

  // Geocoding failure degrades to an unbiased text search rather than
  // failing the whole request — `locationBias` is a refinement, not a
  // requirement, for the Places API (New) `searchText` endpoint.
  const geocoded = await geocode(areaQuery, googleApiKey);

  const textQueryParts = [normalized.category, normalized.keyword].filter(
    (part): part is string => Boolean(part),
  );
  const textQuery = `${textQueryParts.join(" ")} in ${areaQuery}`;

  const places = await searchPlaces(
    {
      textQuery,
      locationBias: geocoded
        ? {
            center: geocoded.location,
            radiusMeters: DEFAULT_SEARCH_RADIUS_METERS,
          }
        : undefined,
    },
    googleApiKey,
  );

  // §6.3 "By identity: every business upsert is keyed on
  // google_place_id (unique)" — the actual Place ID dedup.
  await upsertBusinesses(
    places.map((place) => ({
      googlePlaceId: place.placeId,
      name: place.name,
      category: place.primaryType ?? normalized.category,
      address: place.formattedAddress,
      country: normalized.country,
      city: normalized.city,
      district: normalized.district,
      location: place.location,
      googleRating: place.rating,
      googleReviewCount: place.userRatingCount,
    })),
  );

  const placeIds = places.map((place) => place.placeId);

  await upsertSearchCache({
    signature,
    params: normalized,
    placeIds,
    resultCount: placeIds.length,
    ttlDays: SEARCH_CACHE_TTL_DAYS,
  });

  // Re-read through the same ordered-by-place-id path the cache-hit
  // branch uses — `INSERT ... RETURNING` row order isn't a guarantee
  // worth relying on for a multi-row upsert.
  const orderedBusinesses = await getBusinessesByPlaceIds(placeIds);

  return { businesses: orderedBusinesses, fromCache: false };
}
