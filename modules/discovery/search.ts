import "server-only";

import {
  SEARCH_CACHE_TTL_DAYS,
  SEARCH_PAGE_SIZE_DEFAULT,
  SEARCH_PAGE_SIZE_MAX,
} from "@/config/constants";
import type { DbClient } from "@/lib/db";
import {
  geocode,
  type PlaceSearchResult,
  searchPlaces,
} from "@/modules/google";
import { getDecryptedKeys } from "@/modules/settings";

import {
  getBusinessesByPlaceIds,
  upsertBusinesses,
  type UpsertBusinessInput,
} from "./businesses-repository";
import { withSearchSignatureLock } from "./lock";
import {
  normalizeSearchInput,
  type NormalizedSearchInput,
  type SearchInput,
} from "./normalize";
import {
  extendSearchCachePage,
  getFreshSearchCache,
  getNextPageToken,
  purgeExpiredSearchCache,
  upsertSearchCache,
} from "./search-cache-repository";
import { computeSearchSignature } from "./signature";

/**
 * Cache-First staged search orchestration (architecture.md §2 request
 * lifecycle, §6, §8, §12.3 pagination, §12.4 idempotency). This is the
 * one place that decides "serve from Postgres" vs. "call Google" —
 * callers (the `/api/discovery/search` Route Handler) just provide the
 * signed-in user, their staged search input, and a page.
 */

export class GoogleApiKeyMissingError extends Error {
  constructor() {
    super("Save a Google API key in Settings before searching.");
    this.name = "GoogleApiKeyMissingError";
  }
}

/** Places Search `locationBias` radius around the geocoded area center. */
const DEFAULT_SEARCH_RADIUS_METERS = 15_000;

type SearchCacheRow = NonNullable<
  Awaited<ReturnType<typeof getFreshSearchCache>>
>;

function buildAreaQuery(normalized: NormalizedSearchInput): string {
  return [normalized.district, normalized.city, normalized.country]
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

function toUpsertInput(
  place: PlaceSearchResult,
  normalized: NormalizedSearchInput,
): UpsertBusinessInput {
  return {
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
  };
}

/** Runs the first Places Search call for a signature and seeds `search_cache`. */
async function runInitialSearch(
  normalized: NormalizedSearchInput,
  googleApiKey: string,
  signature: string,
  tx: DbClient,
): Promise<SearchCacheRow> {
  const areaQuery = buildAreaQuery(normalized);

  // Geocoding failure degrades to an unbiased text search rather than
  // failing the whole request — `locationBias` is a refinement, not a
  // requirement, for the Places API (New) `searchText` endpoint.
  const geocoded = await geocode(areaQuery, googleApiKey);

  const textQueryParts = [normalized.category, normalized.keyword].filter(
    (part): part is string => Boolean(part),
  );
  const textQuery = `${textQueryParts.join(" ")} in ${areaQuery}`;

  const { results, nextPageToken } = await searchPlaces(
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
    results.map((place) => toUpsertInput(place, normalized)),
    tx,
  );

  const placeIds = results.map((place) => place.placeId);

  const row = await upsertSearchCache(
    {
      signature,
      params: normalized,
      placeIds,
      resultCount: placeIds.length,
      ttlDays: SEARCH_CACHE_TTL_DAYS,
      nextPageToken,
    },
    tx,
  );
  if (!row) throw new Error("upsertSearchCache did not return a row");
  return row;
}

/** Fetches one more Places Search page and appends it to an existing cache row. */
async function extendWithNextPage(
  cacheRow: SearchCacheRow,
  pageToken: string,
  normalized: NormalizedSearchInput,
  googleApiKey: string,
  tx: DbClient,
): Promise<SearchCacheRow> {
  const { results, nextPageToken } = await searchPlaces(
    { pageToken },
    googleApiKey,
  );

  await upsertBusinesses(
    results.map((place) => toUpsertInput(place, normalized)),
    tx,
  );

  const newPlaceIds = results.map((place) => place.placeId);

  const extended = await extendSearchCachePage(
    cacheRow.id,
    newPlaceIds,
    nextPageToken,
    SEARCH_CACHE_TTL_DAYS,
    tx,
  );

  // The row can only be missing here if it was deleted concurrently
  // (e.g. by the opportunistic purge) between the read and this write —
  // fall back to what we already had rather than failing the request.
  return extended ?? cacheRow;
}

/**
 * Ensures a fresh `search_cache` row exists for `signature`, calling
 * Google at most once for it no matter how many requests race for the
 * same search (architecture.md §12.4 idempotency) — the advisory lock
 * in `modules/discovery/lock.ts` serializes concurrent cache misses,
 * and each waiter re-checks the cache after acquiring the lock instead
 * of assuming it still needs to do the work.
 */
async function ensureFreshSearchCache(
  normalized: NormalizedSearchInput,
  signature: string,
  googleApiKey: string,
): Promise<{ row: SearchCacheRow; fromCache: boolean }> {
  const cached = await getFreshSearchCache(signature);
  if (cached) return { row: cached, fromCache: true };

  const row = await withSearchSignatureLock(signature, async (tx) => {
    const recheck = await getFreshSearchCache(signature, tx);
    if (recheck) return recheck;

    await purgeExpiredSearchCache(20, tx);
    return runInitialSearch(normalized, googleApiKey, signature, tx);
  });

  return { row, fromCache: false };
}

export type SearchBusinessesOptions = {
  /** Offset into the search's ordered result list. Default 0. */
  cursor?: number;
  /** Results per page, capped at `SEARCH_PAGE_SIZE_MAX`. */
  pageSize?: number;
};

export type SearchBusinessesResult = {
  businesses: Awaited<ReturnType<typeof getBusinessesByPlaceIds>>;
  fromCache: boolean;
  /** Offset to request next, or `null` when there's nothing more. */
  nextCursor: number | null;
  /** Total results cached for this search so far (may still grow via pagination). */
  totalCached: number;
};

export async function searchBusinesses(
  userId: string,
  input: SearchInput,
  options: SearchBusinessesOptions = {},
): Promise<SearchBusinessesResult> {
  const cursor = Math.max(0, options.cursor ?? 0);
  const pageSize = Math.min(
    Math.max(1, options.pageSize ?? SEARCH_PAGE_SIZE_DEFAULT),
    SEARCH_PAGE_SIZE_MAX,
  );

  const settings = await getDecryptedKeys(userId);
  if (!settings) throw new GoogleApiKeyMissingError();
  const googleApiKey = settings.googleApiKey;

  const normalized = normalizeSearchInput(input);
  const signature = computeSearchSignature(normalized);

  const { row: initialRow, fromCache } = await ensureFreshSearchCache(
    normalized,
    signature,
    googleApiKey,
  );

  let cacheRow = initialRow;
  let placeIds = cacheRow.placeIds as string[];
  let nextPageToken = getNextPageToken(cacheRow);

  // §8 "'load more' can extend a cached search without restarting it" —
  // only fetch another Google page if the requested window actually
  // reaches past what's cached so far.
  if (cursor + pageSize > placeIds.length && nextPageToken) {
    cacheRow = await withSearchSignatureLock(signature, async (tx) => {
      const recheck = await getFreshSearchCache(signature, tx);
      const current = recheck ?? cacheRow;
      const currentPlaceIds = current.placeIds as string[];
      if (cursor + pageSize <= currentPlaceIds.length) return current;

      const currentToken = getNextPageToken(current);
      if (!currentToken) return current;

      return extendWithNextPage(
        current,
        currentToken,
        normalized,
        googleApiKey,
        tx,
      );
    });
    placeIds = cacheRow.placeIds as string[];
    nextPageToken = getNextPageToken(cacheRow);
  }

  const pagePlaceIds = placeIds.slice(cursor, cursor + pageSize);
  const pageBusinesses = await getBusinessesByPlaceIds(pagePlaceIds);

  const hasMore = cursor + pageSize < placeIds.length || Boolean(nextPageToken);

  return {
    businesses: pageBusinesses,
    fromCache,
    nextCursor: hasMore ? cursor + pageSize : null,
    totalCached: placeIds.length,
  };
}
