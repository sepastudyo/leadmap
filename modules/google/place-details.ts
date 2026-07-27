import "server-only";
import { z } from "zod";

import { GoogleApiError } from "./errors";
import { resolveRequestSignal } from "./request-signal";

/**
 * Place Details client (architecture.md §7.1 "Place Details |
 * Server-side | Enrich a business (phone, website, hours, category) |
 * Permitted fields → businesses.place_summary (~30-day TTL)"). Same
 * API family and conventions as `places-search.ts` — Places API (New),
 * `X-Goog-Api-Key` + `X-Goog-FieldMask` headers — for the same reason
 * (§7.3 "Field masks ... request only the fields we display, minimizing
 * billed data"; the legacy Place Details endpoint has no equivalent
 * control).
 *
 * The field mask below requests exactly the four things §7.1 names —
 * phone, website, hours, category — plus `id`/`displayName` for
 * identity/logging. Nothing else (ratings, photos, reviews) is
 * requested here; those are Places Search's job (already cached) and
 * are explicitly the kind of Place Content §7's ToS note says not to
 * over-cache.
 */

const PLACE_DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "primaryType",
  "internationalPhoneNumber",
  "websiteUri",
  "regularOpeningHours.weekdayDescriptions",
].join(",");

const placeDetailsResponseSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }).optional(),
  primaryType: z.string().optional(),
  internationalPhoneNumber: z.string().optional(),
  websiteUri: z.string().optional(),
  regularOpeningHours: z
    .object({
      weekdayDescriptions: z.array(z.string()).optional(),
    })
    .optional(),
});

export type PlaceDetailsResult = {
  placeId: string;
  name: string | null;
  primaryType: string | null;
  phone: string | null;
  websiteUrl: string | null;
  weekdayHours: string[] | null;
};

/**
 * Fetches Place Details for a single Place ID. Throws `GoogleApiError`
 * for transport failures or a response that doesn't match the expected
 * shape — there's no "zero results" case here (unlike search), since a
 * Place ID either resolves or the request fails.
 */
export async function getPlaceDetails(
  placeId: string,
  apiKey: string,
  options?: { signal?: AbortSignal },
): Promise<PlaceDetailsResult> {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK,
      },
      signal: resolveRequestSignal(options?.signal),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new GoogleApiError(
      `Place Details request failed with HTTP ${response.status}`,
      response.status,
      errorBody,
    );
  }

  const parsed = placeDetailsResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new GoogleApiError(
      "Place Details response did not match the expected shape",
      response.status,
      parsed.error,
    );
  }

  return {
    placeId: parsed.data.id,
    name: parsed.data.displayName?.text ?? null,
    primaryType: parsed.data.primaryType ?? null,
    phone: parsed.data.internationalPhoneNumber ?? null,
    websiteUrl: parsed.data.websiteUri ?? null,
    weekdayHours: parsed.data.regularOpeningHours?.weekdayDescriptions ?? null,
  };
}
