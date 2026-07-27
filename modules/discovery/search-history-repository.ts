import "server-only";
import { desc, eq } from "drizzle-orm";

import { searchCache, searchHistory } from "@/db/schema";
import { db, type DbClient } from "@/lib/db";

import type { NormalizedSearchInput } from "./normalize";

/**
 * `search_history` repository (Sprint 7 Phase 7.1; architecture.md
 * §5.1's two-plane split). Records *which* user ran *which*
 * `search_cache` entry, and when — entirely separate from
 * `search-cache-repository.ts`'s own dedup/read-through logic, which
 * this never touches. Every function takes an optional `dbClient`,
 * defaulting to the shared `db`, matching every other repository in
 * this codebase.
 */

/**
 * Upsert on `(user_id, search_cache_id)` (the table's own unique
 * constraint) — re-running a search a user has already run bumps
 * `searched_at` rather than inserting a duplicate row, so a user's
 * recent-searches list stays distinct-searches-only, most-recent-first.
 */
export async function recordSearch(
  userId: string,
  searchCacheId: string,
  dbClient: DbClient = db,
): Promise<void> {
  await dbClient
    .insert(searchHistory)
    .values({ userId, searchCacheId })
    .onConflictDoUpdate({
      target: [searchHistory.userId, searchHistory.searchCacheId],
      set: { searchedAt: new Date() },
    });
}

export type RecentSearch = {
  searchCacheId: string;
  params: NormalizedSearchInput;
  resultCount: number;
  searchedAt: Date;
};

/**
 * A user's last `limit` distinct searches, most recent first — joined
 * with `search_cache` for the display fields (Dashboard's "Recent
 * searches" card, Phase 7.3) needs: the normalized params (to show/
 * re-run the search) and the result count at the time it was last
 * recorded. `search_cache` is read-only here, matching architecture.md
 * §13.2 ("Shared-plane data ... is read-only cache to users").
 */
export async function listRecentSearches(
  userId: string,
  limit = 5,
  dbClient: DbClient = db,
): Promise<RecentSearch[]> {
  const rows = await dbClient
    .select({
      searchCacheId: searchHistory.searchCacheId,
      params: searchCache.params,
      resultCount: searchCache.resultCount,
      searchedAt: searchHistory.searchedAt,
    })
    .from(searchHistory)
    .innerJoin(searchCache, eq(searchCache.id, searchHistory.searchCacheId))
    .where(eq(searchHistory.userId, userId))
    .orderBy(desc(searchHistory.searchedAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    params: row.params as NormalizedSearchInput,
  }));
}
