import "server-only";
import { z } from "zod";

import { GEO_USER_AGENT } from "@/config/constants";

import { GeoApiError } from "./errors";
import {
  buildFormattedAddress,
  escapeOverpassRegex,
  extractPrimaryType,
} from "./osm-tags";
import { resolveRequestSignal } from "./request-signal";
import type { LatLng } from "./types";

/**
 * Business search client (architecture.md §7.1 "Places Search |
 * Server-side | Discovery by category/keyword within a geographic
 * area"). Backed by the Overpass API (https://overpass-api.de — a free
 * query service over OpenStreetMap data), replacing Google's Places
 * API (New) `searchText`.
 *
 * Overpass has no free-text/NLP search — it's a structured query
 * language over tags, and it always needs a bounding area (a global,
 * unbounded query isn't a real option on a shared public service).
 * Category matching here is a best-effort regex match of the user's
 * typed category against the *tag values* OSM itself uses (`amenity`,
 * `shop`, `office`, `craft`, `tourism`, `leisure`, `healthcare` — see
 * `osm-tags.ts`) — this recalls well when a user's wording is close to
 * OSM's own vocabulary ("restaurant", "hotel", "dentist", ...) and less
 * well for wording that isn't ("coffee shop" vs. OSM's "cafe"). A
 * disclosed trade-off of moving off Google's NLP-backed search, not an
 * oversight.
 *
 * No true pagination — Overpass returns everything matching in one
 * response, not a page at a time — so `nextPageToken` here is always
 * `null` and the `pageToken` branch below is never actually reached in
 * practice; kept for interface symmetry with `SearchPlacesParams`'s
 * existing shape (and for a future provider that does paginate) rather
 * than restructuring `modules/discovery/search.ts`'s own pagination
 * logic, which already tolerates "no more pages" gracefully.
 */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
/** Generous single-shot cap — the existing client-side cursor (20 at a
 * time) pages through whatever comes back, so this just bounds how
 * much a single Overpass query returns and how many "load more" clicks
 * it can satisfy before a fresh search would be needed. */
const DEFAULT_RESULT_LIMIT = 200;

const overpassElementSchema = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

const overpassResponseSchema = z.object({
  elements: z.array(overpassElementSchema),
});

export type PlaceSearchResult = {
  placeId: string;
  name: string;
  formattedAddress: string;
  location: LatLng;
  rating: number | null;
  userRatingCount: number | null;
  primaryType: string | null;
  businessStatus: string | null;
};

export type SearchPlacesParams =
  | {
      category: string;
      keyword?: string | null;
      locationBias: { center: LatLng; radiusMeters: number };
      maxResultCount?: number;
      pageToken?: undefined;
    }
  | {
      /** Never actually produced by `searchPlaces` below (see file
       * comment) — kept so callers built around "a page token means
       * continue this search" don't need their own branch removed. */
      pageToken: string;
    };

export type SearchPlacesResponse = {
  results: PlaceSearchResult[];
  nextPageToken: string | null;
};

function isPageTokenRequest(
  params: SearchPlacesParams,
): params is { pageToken: string } {
  return "pageToken" in params && params.pageToken !== undefined;
}

const OSM_TYPE_KEY_PATTERN =
  "amenity|shop|office|craft|tourism|leisure|healthcare";

function buildOverpassQuery(params: {
  category: string;
  keyword?: string | null;
  center: LatLng;
  radiusMeters: number;
  limit: number;
}): string {
  const categoryPattern = escapeOverpassRegex(params.category);
  const keywordFilter = params.keyword
    ? `["name"~"${escapeOverpassRegex(params.keyword)}",i]`
    : "";

  return (
    `[out:json][timeout:25];\n` +
    `(\n` +
    `  nwr(around:${params.radiusMeters},${params.center.lat},${params.center.lng})` +
    `["name"][~"^(${OSM_TYPE_KEY_PATTERN})$"~"${categoryPattern}",i]${keywordFilter};\n` +
    `);\n` +
    `out center ${params.limit};`
  );
}

function toPlaceSearchResult(
  element: z.infer<typeof overpassElementSchema>,
): PlaceSearchResult | null {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  const name = element.tags?.name;
  if (!name) return null;

  return {
    placeId: `${element.type}/${element.id}`,
    name,
    formattedAddress: buildFormattedAddress(
      element.tags,
      "Address unavailable",
    ),
    location: { lat, lng: lon },
    rating: null,
    userRatingCount: null,
    primaryType: extractPrimaryType(element.tags),
    businessStatus: null,
  };
}

/**
 * Runs a business search within an area (or, per the file comment,
 * would continue one via `pageToken` — never actually exercised).
 * Never throws for a legitimately empty result set (`results: []`);
 * throws `GeoApiError` for transport failures or a response that
 * doesn't match the expected shape.
 */
export async function searchPlaces(
  params: SearchPlacesParams,
  options?: { signal?: AbortSignal },
): Promise<SearchPlacesResponse> {
  if (isPageTokenRequest(params)) {
    // Never reached in practice (see file comment) — Overpass has no
    // token-based continuation to resume.
    return { results: [], nextPageToken: null };
  }

  const query = buildOverpassQuery({
    category: params.category,
    keyword: params.keyword,
    center: params.locationBias.center,
    radiusMeters: params.locationBias.radiusMeters,
    limit: params.maxResultCount ?? DEFAULT_RESULT_LIMIT,
  });

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": GEO_USER_AGENT,
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: resolveRequestSignal(options?.signal),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new GeoApiError(
      `Business search request failed with HTTP ${response.status}`,
      response.status,
      errorBody,
    );
  }

  const parsed = overpassResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new GeoApiError(
      "Business search response did not match the expected shape",
      response.status,
      parsed.error,
    );
  }

  const results = parsed.data.elements
    .map(toPlaceSearchResult)
    .filter((result): result is PlaceSearchResult => result !== null);

  // Always null — see file comment on pagination.
  return { results, nextPageToken: null };
}
