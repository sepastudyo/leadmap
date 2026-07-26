import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * architecture.md §5.2 `search_cache` — GLOBAL search reuse + dedup:
 * id (uuid pk) · signature (text unique) · params (jsonb — normalized
 * query) · place_ids (jsonb array — ordered result Place IDs) ·
 * result_count (int) · provider_page_tokens (jsonb, nullable) ·
 * created_at · expires_at · last_accessed_at
 *
 * `signature` is a stable hash of the normalized search params
 * (architecture.md §6.3) — `modules/discovery` computes it, this table
 * just enforces the uniqueness that makes repeated identical searches
 * collapse to one row.
 */
export const searchCache = pgTable(
  "search_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    signature: text("signature").notNull().unique(),
    params: jsonb("params").notNull(),
    placeIds: jsonb("place_ids").notNull(),
    resultCount: integer("result_count").notNull(),
    providerPageTokens: jsonb("provider_page_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // architecture.md §5.4 "Efficient expiry sweeps on read"
    index("search_cache_expires_at_idx").on(table.expiresAt),
  ],
);
