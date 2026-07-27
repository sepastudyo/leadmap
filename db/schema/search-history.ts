import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { searchCache } from "./search-cache";
import { users } from "./users";

/**
 * `search_history` — USER plane (Sprint 7 Phase 7.1; not in
 * architecture.md's original §5.2 dictionary, added the same way
 * `idempotency_keys` was in Sprint 2 — see that file's own comment for
 * the precedent). Records *which* user ran *which* search, and when,
 * without touching `search_cache` (architecture.md §5.1's GLOBAL,
 * deduplicated shared-plane cache) at all: two users running the
 * identical search still produce exactly one `search_cache` row (Cache
 * First's dedup guarantee, untouched) and two independent
 * `search_history` rows, one per user.
 *
 * `unique (user_id, search_cache_id)`: re-running a search a user has
 * already run bumps this row (upsert on conflict, `searched_at` set to
 * now) rather than inserting a duplicate — the same "stamp on access"
 * idea `search_cache.last_accessed_at` already uses, so a user's
 * recent-searches list shows distinct searches, most-recent-first, not
 * a repeat-cluttered log.
 */
export const searchHistory = pgTable(
  "search_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    searchCacheId: uuid("search_cache_id")
      .notNull()
      .references(() => searchCache.id),
    searchedAt: timestamp("searched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Backs the upsert-on-repeat semantics described above.
    unique("search_history_user_search_cache_key").on(
      table.userId,
      table.searchCacheId,
    ),
    // "This user's last N searches, most recent first" — the same
    // `(user_id, ... desc)` shape `notes_user_business_pinned_...`
    // already uses for its own timeline read (§5.4).
    index("search_history_user_searched_at_idx").on(
      table.userId,
      table.searchedAt.desc(),
    ),
  ],
);
