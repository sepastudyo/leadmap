import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { businesses } from "./businesses";

/**
 * architecture.md §5.2 `analysis_history` — OPTIONAL, GLOBAL, append-only
 * (populated only on manual re-analysis; never scheduled): `id (uuid
 * pk)` · `business_id (fk)` · `analysis (jsonb — frozen result)` ·
 * `content_hash` · `analyzer_version` · `captured_at`.
 *
 * `analysis` stores the *prior* `website_analyses` row verbatim (see
 * `modules/intelligence/analysis/persist.ts`) — a frozen copy of what
 * the current row is about to overwrite, archived before the upsert.
 * Not `.$type()`-annotated like `website_analyses`'s columns: this is
 * deliberately an opaque archival blob, never queried/re-typed by
 * anything downstream in this phase.
 */
export const analysisHistory = pgTable(
  "analysis_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    analysis: jsonb("analysis").notNull(),
    contentHash: text("content_hash").notNull(),
    analyzerVersion: text("analyzer_version").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Not in architecture.md §5.4's index table (which doesn't cover
    // this optional table) — a business/time lookup index matching the
    // same shape `notes`'s own `(user_id, business_id, created_at desc)`
    // index already establishes as this app's convention for a
    // per-entity timeline.
    index("analysis_history_business_captured_idx").on(
      table.businessId,
      table.capturedAt.desc(),
    ),
  ],
);
