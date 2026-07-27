import "server-only";
import { z } from "zod";

import { GEO_USER_AGENT } from "@/config/constants";

import { GeoApiError } from "./errors";
import { extractPrimaryType } from "./osm-tags";
import { resolveRequestSignal } from "./request-signal";

/**
 * Business Details client (architecture.md §7.1 "Place Details |
 * Server-side | Enrich a business (phone, website, hours, category)").
 * Backed by Overpass, re-fetching the same OSM element `places-search.ts`
 * found by its `{type}/{id}` reference (`placeId`) — OSM tags carry
 * contact info directly on the element itself, so "enrichment" here is
 * a fresh, authoritative re-read of that one element's current tags,
 * not a separate, richer API tier the way Google's Place Details was
 * relative to Places Search.
 *
 * `weekdayHours` is a single raw OSM `opening_hours` syntax string
 * (e.g. `"Mo-Fr 09:00-18:00"`), not one entry per weekday the way
 * Google's `regularOpeningHours.weekdayDescriptions` was — parsing that
 * micro-syntax into a per-day breakdown would be a real new feature,
 * out of scope for a provider swap; the raw string is still genuinely
 * useful, just not reformatted.
 */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const overpassDetailElementSchema = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number(),
  tags: z.record(z.string(), z.string()).optional(),
});

const overpassDetailResponseSchema = z.object({
  elements: z.array(overpassDetailElementSchema),
});

export type PlaceDetailsResult = {
  placeId: string;
  name: string | null;
  primaryType: string | null;
  phone: string | null;
  websiteUrl: string | null;
  weekdayHours: string[] | null;
};

const VALID_ELEMENT_TYPES = new Set(["node", "way", "relation"]);

/**
 * Fetches current details for a single business by its `{type}/{id}`
 * reference. Throws `GeoApiError` for a malformed id, a transport
 * failure, or a response that doesn't match the expected shape — there
 * is no "zero results" case (the id came from an earlier search, so it
 * should resolve, mirroring the original Google client's contract).
 */
export async function getPlaceDetails(
  placeId: string,
  options?: { signal?: AbortSignal },
): Promise<PlaceDetailsResult> {
  const [elementType, elementId] = placeId.split("/");
  if (!elementType || !elementId || !VALID_ELEMENT_TYPES.has(elementType)) {
    throw new GeoApiError(`Invalid business id: ${placeId}`, 400);
  }

  const query = `[out:json][timeout:25];\n${elementType}(${elementId});\nout center;`;

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
      `Business details request failed with HTTP ${response.status}`,
      response.status,
      errorBody,
    );
  }

  const parsed = overpassDetailResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new GeoApiError(
      "Business details response did not match the expected shape",
      response.status,
      parsed.error,
    );
  }

  const [element] = parsed.data.elements;
  if (!element) {
    throw new GeoApiError(`Business ${placeId} not found`, 404);
  }

  const tags = element.tags;

  return {
    placeId,
    name: tags?.name ?? null,
    primaryType: extractPrimaryType(tags),
    phone: tags?.phone ?? tags?.["contact:phone"] ?? null,
    websiteUrl: tags?.website ?? tags?.["contact:website"] ?? null,
    weekdayHours: tags?.opening_hours ? [tags.opening_hours] : null,
  };
}
