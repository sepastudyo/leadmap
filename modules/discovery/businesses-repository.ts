import "server-only";
import { inArray, sql } from "drizzle-orm";

import { businesses } from "@/db/schema";
import type { LatLng } from "@/db/schema/columns";
import { db } from "@/lib/db";

/**
 * `businesses` repository (architecture.md §5.2, §6.3 "Place ID
 * dedup/upsert"). Deliberately only ever writes the Sprint 2
 * (discovery) columns — `phone` / `website_url` / `place_summary` /
 * `details_fetched_at` / `details_expires_at` are Sprint 3's (Place
 * Details) and are never referenced in the `onConflictDoUpdate` set, so
 * a repeat search can't wipe out detail data a later sprint wrote.
 */

export type UpsertBusinessInput = {
  googlePlaceId: string;
  name: string;
  category: string;
  address: string;
  country: string;
  city: string;
  district: string | null;
  location: LatLng;
  googleRating: number | null;
  googleReviewCount: number | null;
};

/**
 * Batch upsert keyed on `google_place_id` (architecture.md §6.3 "every
 * business upsert is keyed on google_place_id (unique) ... resolves to
 * one row"). `excluded.*` is used in the update `set` (rather than
 * repeating each JS value) because this is a multi-row insert — each
 * conflicting row must take *its own* proposed values, not one shared
 * value.
 */
export async function upsertBusinesses(inputs: UpsertBusinessInput[]) {
  if (inputs.length === 0) return [];

  return db
    .insert(businesses)
    .values(inputs)
    .onConflictDoUpdate({
      target: businesses.googlePlaceId,
      set: {
        name: sql`excluded.name`,
        category: sql`excluded.category`,
        address: sql`excluded.address`,
        country: sql`excluded.country`,
        city: sql`excluded.city`,
        district: sql`excluded.district`,
        location: sql`excluded.location`,
        googleRating: sql`excluded.google_rating`,
        googleReviewCount: sql`excluded.google_review_count`,
        updatedAt: new Date(),
      },
    })
    .returning();
}

/**
 * Reads businesses back in the exact order of `placeIds` — `search_cache
 * .place_ids` is an *ordered* result list (architecture.md §5.2), and
 * SQL `IN` makes no ordering guarantee, so this reorders in JS after a
 * single batched `IN` query rather than issuing N queries.
 */
export async function getBusinessesByPlaceIds(placeIds: string[]) {
  if (placeIds.length === 0) return [];

  const rows = await db
    .select()
    .from(businesses)
    .where(inArray(businesses.googlePlaceId, placeIds));

  const byPlaceId = new Map(rows.map((row) => [row.googlePlaceId, row]));

  return placeIds
    .map((placeId) => byPlaceId.get(placeId))
    .filter((row): row is (typeof rows)[number] => row !== undefined);
}
