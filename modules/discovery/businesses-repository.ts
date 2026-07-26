import "server-only";
import { eq, inArray, sql } from "drizzle-orm";

import { businesses } from "@/db/schema";
import type { LatLng } from "@/db/schema/columns";
import { db, type DbClient } from "@/lib/db";

/**
 * `businesses` repository (architecture.md §5.2, §6.3 "Place ID
 * dedup/upsert"). `upsertBusinesses` (Sprint 2 discovery) deliberately
 * only ever writes the discovery columns — `phone` / `website_url` /
 * `place_summary` / `details_fetched_at` / `details_expires_at` are
 * Sprint 3's (Place Details) and are never referenced in its
 * `onConflictDoUpdate` set, so a repeat search can't clobber detail
 * data. `updatePlaceDetailsForBusiness` (Sprint 3) is the mirror image:
 * it only ever writes the detail columns, never the discovery ones —
 * each write path stays scoped to the columns its own sprint owns.
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
export async function upsertBusinesses(
  inputs: UpsertBusinessInput[],
  dbClient: DbClient = db,
) {
  if (inputs.length === 0) return [];

  return dbClient
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
export async function getBusinessesByPlaceIds(
  placeIds: string[],
  dbClient: DbClient = db,
) {
  if (placeIds.length === 0) return [];

  const rows = await dbClient
    .select()
    .from(businesses)
    .where(inArray(businesses.googlePlaceId, placeIds));

  const byPlaceId = new Map(rows.map((row) => [row.googlePlaceId, row]));

  return placeIds
    .map((placeId) => byPlaceId.get(placeId))
    .filter((row): row is (typeof rows)[number] => row !== undefined);
}

/** Reads a single business by its own `id` — the lookup Place Details
 * enrichment (Sprint 3) needs, distinct from `getBusinessesByPlaceIds`'s
 * batch-by-`google_place_id` lookup that discovery uses. */
export async function getBusinessById(id: string, dbClient: DbClient = db) {
  const [row] = await dbClient
    .select()
    .from(businesses)
    .where(eq(businesses.id, id))
    .limit(1);

  return row ?? null;
}

/** `place_summary`'s shape — cached fields Place Details returns that
 * don't have their own dedicated column (architecture.md §5.2
 * "place_summary (jsonb — permitted cached fields)"). */
export type PlaceSummary = {
  hours: string[] | null;
};

export type UpdatePlaceDetailsInput = {
  phone: string | null;
  websiteUrl: string | null;
  /** `null` leaves the existing category untouched — Place Details'
   * `primaryType` isn't always present, and discovery already seeded
   * a reasonable value. */
  category: string | null;
  placeSummary: PlaceSummary;
  detailsFetchedAt: Date;
  detailsExpiresAt: Date;
};

/**
 * Writes Place Details enrichment onto an existing `businesses` row
 * (architecture.md §7.1 "Permitted fields → businesses.place_summary").
 * Only ever touches the detail columns — see the file-level comment for
 * why `upsertBusinesses` and this function each stay scoped to the
 * columns their own sprint owns.
 */
export async function updatePlaceDetailsForBusiness(
  id: string,
  input: UpdatePlaceDetailsInput,
  dbClient: DbClient = db,
) {
  const [row] = await dbClient
    .update(businesses)
    .set({
      phone: input.phone,
      websiteUrl: input.websiteUrl,
      ...(input.category ? { category: input.category } : {}),
      placeSummary: input.placeSummary,
      detailsFetchedAt: input.detailsFetchedAt,
      detailsExpiresAt: input.detailsExpiresAt,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, id))
    .returning();

  return row ?? null;
}
