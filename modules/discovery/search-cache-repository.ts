import "server-only";
import { eq, inArray, lt } from "drizzle-orm";

import { searchCache } from "@/db/schema";
import { db, type DbClient } from "@/lib/db";

import type { NormalizedSearchInput } from "./normalize";

/**
 * `search_cache` repository — the Cache-First read-through
 * (architecture.md §6.2, §6.3), page-token pagination (§8 "provider page
 * tokens ... stored on the search_cache row so 'load more' can extend
 * a cached search without restarting it"), and opportunistic purge
 * (§6.4). Every function takes an optional `dbClient`, defaulting to
 * the shared `db` — pass a `tx` (from `modules/discovery/lock.ts`) to
 * make the query part of that transaction instead.
 */

type ProviderPageTokens = { nextPageToken: string | null };

function getNextPageToken(row: { providerPageTokens: unknown }): string | null {
  const tokens = row.providerPageTokens as ProviderPageTokens | null;
  return tokens?.nextPageToken ?? null;
}

/**
 * Fresh-only read: returns `null` for both "no row" and "row present
 * but expired" — both are a cache miss from the caller's perspective,
 * and a stale row still gets replaced (not appended to) by the
 * subsequent `upsertSearchCache` call on `signature`.
 */
export async function getFreshSearchCache(
  signature: string,
  dbClient: DbClient = db,
) {
  const [row] = await dbClient
    .select()
    .from(searchCache)
    .where(eq(searchCache.signature, signature))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  // §6.2 "last_accessed_at is stamped on read so rarely-used cache rows
  // are identifiable for later purge."
  await dbClient
    .update(searchCache)
    .set({ lastAccessedAt: new Date() })
    .where(eq(searchCache.id, row.id));

  return row;
}

export type UpsertSearchCacheInput = {
  signature: string;
  params: NormalizedSearchInput;
  placeIds: string[];
  resultCount: number;
  ttlDays: number;
  nextPageToken: string | null;
};

/**
 * Insert-or-update on `signature` (architecture.md §6.3 "Upsert
 * semantics: discovery writes are idempotent"), so re-running an
 * expired search refreshes the same row instead of accumulating
 * duplicates.
 */
export async function upsertSearchCache(
  input: UpsertSearchCacheInput,
  dbClient: DbClient = db,
) {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + input.ttlDays * 24 * 60 * 60 * 1000,
  );
  const providerPageTokens: ProviderPageTokens = {
    nextPageToken: input.nextPageToken,
  };

  const [row] = await dbClient
    .insert(searchCache)
    .values({
      signature: input.signature,
      params: input.params,
      placeIds: input.placeIds,
      resultCount: input.resultCount,
      providerPageTokens,
      expiresAt,
      lastAccessedAt: now,
    })
    .onConflictDoUpdate({
      target: searchCache.signature,
      set: {
        params: input.params,
        placeIds: input.placeIds,
        resultCount: input.resultCount,
        providerPageTokens,
        expiresAt,
        lastAccessedAt: now,
      },
    })
    .returning();

  return row;
}

/**
 * Extends an existing cache row with one more page of Places Search
 * results (architecture.md §8). Appends to `place_ids` — de-duplicated,
 * since the provider's pagination isn't guaranteed disjoint from what's
 * already cached — refreshes `provider_page_tokens` with whatever
 * comes next (or `null` once exhausted), and bumps `expires_at`/
 * `result_count` to reflect the newly-extended set.
 */
export async function extendSearchCachePage(
  cacheRowId: string,
  newPlaceIds: string[],
  nextPageToken: string | null,
  ttlDays: number,
  dbClient: DbClient = db,
) {
  const [existing] = await dbClient
    .select()
    .from(searchCache)
    .where(eq(searchCache.id, cacheRowId))
    .limit(1);
  if (!existing) return null;

  const existingPlaceIds = existing.placeIds as string[];
  const merged = [
    ...existingPlaceIds,
    ...newPlaceIds.filter((id) => !existingPlaceIds.includes(id)),
  ];
  const now = new Date();
  const providerPageTokens: ProviderPageTokens = { nextPageToken };

  const [row] = await dbClient
    .update(searchCache)
    .set({
      placeIds: merged,
      resultCount: merged.length,
      providerPageTokens,
      expiresAt: new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000),
      lastAccessedAt: now,
    })
    .where(eq(searchCache.id, cacheRowId))
    .returning();

  return row;
}

/**
 * Small, bounded opportunistic purge (§6.4) — called inline on a cache
 * miss, never on a schedule. `limit` keeps a single request from ever
 * doing an unbounded delete.
 */
export async function purgeExpiredSearchCache(
  limit = 20,
  dbClient: DbClient = db,
): Promise<number> {
  const stale = await dbClient
    .select({ id: searchCache.id })
    .from(searchCache)
    .where(lt(searchCache.expiresAt, new Date()))
    .limit(limit);

  if (stale.length === 0) return 0;

  await dbClient.delete(searchCache).where(
    inArray(
      searchCache.id,
      stale.map((row) => row.id),
    ),
  );

  return stale.length;
}

export { getNextPageToken };
