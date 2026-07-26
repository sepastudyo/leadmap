import "server-only";
import { eq, inArray, lt } from "drizzle-orm";

import { searchCache } from "@/db/schema";
import { db } from "@/lib/db";

import type { NormalizedSearchInput } from "./normalize";

/**
 * `search_cache` repository — the Cache-First read-through
 * (architecture.md §6.2, §6.3) and opportunistic purge (§6.4: "expired
 * cache rows are cleaned opportunistically during reads (small, bounded
 * deletes on expires_at indexes) ... no cron").
 */

/**
 * Fresh-only read: returns `null` for both "no row" and "row present
 * but expired" — both are a cache miss from the caller's perspective,
 * and a stale row still gets replaced (not appended to) by the
 * subsequent `upsertSearchCache` call on `signature`.
 */
export async function getFreshSearchCache(signature: string) {
  const [row] = await db
    .select()
    .from(searchCache)
    .where(eq(searchCache.signature, signature))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  // §6.2 "last_accessed_at is stamped on read so rarely-used cache rows
  // are identifiable for later purge."
  await db
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
};

/**
 * Insert-or-update on `signature` (architecture.md §6.3 "Upsert
 * semantics: discovery writes are idempotent"), so re-running an
 * expired search refreshes the same row instead of accumulating
 * duplicates.
 */
export async function upsertSearchCache(input: UpsertSearchCacheInput) {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + input.ttlDays * 24 * 60 * 60 * 1000,
  );

  const [row] = await db
    .insert(searchCache)
    .values({
      signature: input.signature,
      params: input.params,
      placeIds: input.placeIds,
      resultCount: input.resultCount,
      expiresAt,
      lastAccessedAt: now,
    })
    .onConflictDoUpdate({
      target: searchCache.signature,
      set: {
        params: input.params,
        placeIds: input.placeIds,
        resultCount: input.resultCount,
        expiresAt,
        lastAccessedAt: now,
      },
    })
    .returning();

  return row;
}

/**
 * Small, bounded opportunistic purge (§6.4) — called inline on a cache
 * miss, never on a schedule. `limit` keeps a single request from ever
 * doing an unbounded delete.
 */
export async function purgeExpiredSearchCache(limit = 20): Promise<number> {
  const stale = await db
    .select({ id: searchCache.id })
    .from(searchCache)
    .where(lt(searchCache.expiresAt, new Date()))
    .limit(limit);

  if (stale.length === 0) return 0;

  await db.delete(searchCache).where(
    inArray(
      searchCache.id,
      stale.map((row) => row.id),
    ),
  );

  return stale.length;
}
