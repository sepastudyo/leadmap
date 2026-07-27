import "server-only";
import { z } from "zod";

import { GoogleApiError } from "./errors";
import { resolveRequestSignal } from "./request-signal";
import type { LatLng } from "./types";

/**
 * Geocoding API client (architecture.md §7.1 "Geocoding | Server-side |
 * Resolve Country/City/District to coordinates for search + map
 * centering"). Used by `modules/discovery` to turn a staged
 * Country/City/District search into a location bias for Places Search.
 * Not cached on its own — architecture.md §5.2's entity dictionary
 * defines no geocode cache table, so a fresh call is made on every
 * `search_cache` miss (the same request that would hit Places Search
 * anyway).
 */

const geocodingResponseSchema = z.object({
  status: z.string(),
  error_message: z.string().optional(),
  results: z.array(
    z.object({
      place_id: z.string(),
      formatted_address: z.string(),
      geometry: z.object({
        location: z.object({ lat: z.number(), lng: z.number() }),
      }),
    }),
  ),
});

export type GeocodeResult = {
  placeId: string;
  formattedAddress: string;
  location: LatLng;
};

/**
 * Resolves a free-text area query (e.g. "Kadıköy, Istanbul, Turkey") to
 * coordinates. Returns `null` for `ZERO_RESULTS` — "no such place" is a
 * legitimate outcome, not a failure. Throws `GoogleApiError` for
 * transport failures or any other non-OK API status (bad key, quota
 * exhausted, malformed request).
 */
export async function geocode(
  query: string,
  apiKey: string,
  options?: { signal?: AbortSignal },
): Promise<GeocodeResult | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url, {
    signal: resolveRequestSignal(options?.signal),
  });

  if (!response.ok) {
    throw new GoogleApiError(
      `Geocoding request failed with HTTP ${response.status}`,
      response.status,
    );
  }

  const parsed = geocodingResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new GoogleApiError(
      "Geocoding response did not match the expected shape",
      response.status,
      parsed.error,
    );
  }

  const { status, results, error_message: errorMessage } = parsed.data;

  if (status === "ZERO_RESULTS") return null;
  if (status !== "OK") {
    throw new GoogleApiError(
      errorMessage ?? `Geocoding failed with status ${status}`,
      response.status,
    );
  }

  const [first] = results;
  if (!first) return null;

  return {
    placeId: first.place_id,
    formattedAddress: first.formatted_address,
    location: {
      lat: first.geometry.location.lat,
      lng: first.geometry.location.lng,
    },
  };
}
