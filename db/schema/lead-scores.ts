import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { businesses } from "./businesses";

/**
 * architecture.md §5.2 `lead_scores` — GLOBAL current score per
 * business: `id (uuid pk)` · `business_id (fk unique)` · `total (int
 * 0–100)` · `breakdown (jsonb — per-rule contribution + reason)` ·
 * `ruleset_version (int)` · `computed_at`.
 *
 * `businesses 1─1 lead_scores` (§5.3) — one current row per business,
 * upserted on `business_id` (mirrors `website_analyses`'s documented
 * "one current row per business" shape, even though that table isn't
 * built yet — persisting *to* it is out of this phase's scope).
 */
export const leadScores = pgTable(
  "lead_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .unique()
      .references(() => businesses.id),
    total: integer("total").notNull(),
    breakdown: jsonb("breakdown").notNull(),
    rulesetVersion: integer("ruleset_version").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // architecture.md §5.4 "lead_scores | btree (total desc) | 'Top opportunities' ordering"
    index("lead_scores_total_idx").on(table.total.desc()),
  ],
);
