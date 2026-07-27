import "server-only";
import { z } from "zod";

import { GEO_USER_AGENT } from "@/config/constants";

import { GeoApiError } from "./errors";
import { resolveRequestSignal } from "./request-signal";
import type { LatLng } from "./types";

/**
 * Geocoding client (architecture.md §7.1 "Geocoding | Server-side |
 * Resolve Country/City/District to coordinates for search + map
 * centering"). Backed by Nominatim (OpenStreetMap's free geocoder,
 * https://nominatim.org), replacing Google's Geocoding API. Used by
 * `modules/discovery` to turn a staged Country/City/District search
 * into a center point Overpass can search around. Not cached on its
 * own — architecture.md §5.2's entity dictionary defines no geocode
 * cache table, so a fresh call is made on every `search_cache` miss
 * (the same request that would hit business search anyway).
 *
 * No API key — Nominatim's public instance is free and keyless; its
 * usage policy instead requires a descriptive `User-Agent` (sent
 * below) and a max of one request/second, which this app's per-search
 * (not per-result) call pattern already respects.
 */

const nominatimResultSchema = z.object({
  place_id: z.number(),
  display_name: z.string(),
  lat: z.string(),
  lon: z.string(),
});

const nominatimResponseSchema = z.array(nominatimResultSchema);

export type GeocodeResult = {
  placeId: string;
  formattedAddress: string;
  location: LatLng;
};

/**
 * Resolves a free-text area query (e.g. "Kadıköy, Istanbul, Turkey") to
 * coordinates. Returns `null` when Nominatim finds nothing — "no such
 * place" is a legitimate outcome, not a failure. Throws `GeoApiError`
 * for transport failures or a response that doesn't match the expected
 * shape.
 */
export async function geocode(
  query: string,
  options?: { signal?: AbortSignal },
): Promise<GeocodeResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: { "User-Agent": GEO_USER_AGENT },
    signal: resolveRequestSignal(options?.signal),
  });

  if (!response.ok) {
    throw new GeoApiError(
      `Geocoding request failed with HTTP ${response.status}`,
      response.status,
    );
  }

  const parsed = nominatimResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new GeoApiError(
      "Geocoding response did not match the expected shape",
      response.status,
      parsed.error,
    );
  }

  const [first] = parsed.data;
  if (!first) return null;

  return {
    placeId: String(first.place_id),
    formattedAddress: first.display_name,
    location: { lat: Number(first.lat), lng: Number(first.lon) },
  };
}
