import "server-only";
import { z } from "zod";

import { GoogleApiError } from "./errors";
import type { LatLng } from "./types";

/**
 * Places Search client (architecture.md §7.1 "Places Search | Server-side
 * | Discovery by category/keyword within a geographic area"). Uses the
 * current Places API ("Places API (New)") `searchText` endpoint —
 * chosen over the legacy Nearby/Text Search endpoints specifically
 * because it's field-mask-driven, which is what architecture.md §7.3
 * requires ("Field masks ... request only the fields we display,
 * minimizing billed data"); the legacy API has no equivalent control.
 */

const PLACES_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.primaryType",
  "places.businessStatus",
].join(",");

const placeSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }),
  formattedAddress: z.string(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  primaryType: z.string().optional(),
  businessStatus: z.string().optional(),
});

const searchTextResponseSchema = z.object({
  places: z.array(placeSchema).optional(),
  nextPageToken: z.string().optional(),
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
      /** Free-text query, e.g. "coffee shop in Kadıköy, Istanbul, Turkey". */
      textQuery: string;
      /** Optional refinement — biases (not restricts) results toward an area. */
      locationBias?: { center: LatLng; radiusMeters: number };
      maxResultCount?: number;
      pageToken?: undefined;
    }
  | {
      /**
       * Continues a previous search (architecture.md §8 "Google page
       * tokens ... stored on the search_cache row so 'load more' can
       * extend a cached search without restarting it"). Per Google's
       * Places API (New) contract, a page-token request carries no
       * other search params — the token itself encodes the original
       * query server-side.
       */
      pageToken: string;
    };

export type SearchPlacesResponse = {
  results: PlaceSearchResult[];
  /** Present when more results exist beyond this page; feed back in as `pageToken`. */
  nextPageToken: string | null;
};

function isPageTokenRequest(
  params: SearchPlacesParams,
): params is { pageToken: string } {
  return "pageToken" in params && params.pageToken !== undefined;
}

/**
 * Runs a Places text search (or continues one via `pageToken`). Never
 * throws for a legitimately empty result set (`results: []`); throws
 * `GoogleApiError` for transport failures or a response that doesn't
 * match the expected shape.
 */
export async function searchPlaces(
  params: SearchPlacesParams,
  apiKey: string,
  options?: { signal?: AbortSignal },
): Promise<SearchPlacesResponse> {
  const body: Record<string, unknown> = isPageTokenRequest(params)
    ? { pageToken: params.pageToken }
    : {
        textQuery: params.textQuery,
        maxResultCount: params.maxResultCount ?? 20,
      };

  if (!isPageTokenRequest(params) && params.locationBias) {
    body.locationBias = {
      circle: {
        center: {
          latitude: params.locationBias.center.lat,
          longitude: params.locationBias.center.lng,
        },
        radius: params.locationBias.radiusMeters,
      },
    };
  }

  const response = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": PLACES_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new GoogleApiError(
      `Places Search request failed with HTTP ${response.status}`,
      response.status,
      errorBody,
    );
  }

  const parsed = searchTextResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new GoogleApiError(
      "Places Search response did not match the expected shape",
      response.status,
      parsed.error,
    );
  }

  const results = (parsed.data.places ?? []).map((place) => ({
    placeId: place.id,
    name: place.displayName.text,
    formattedAddress: place.formattedAddress,
    location: { lat: place.location.latitude, lng: place.location.longitude },
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
    primaryType: place.primaryType ?? null,
    businessStatus: place.businessStatus ?? null,
  }));

  return { results, nextPageToken: parsed.data.nextPageToken ?? null };
}
