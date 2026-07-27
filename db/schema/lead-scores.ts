import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type { ScoreBreakdownEntry } from "@/modules/intelligence/scoring/engine";

import { businesses } from "./businesses";

/**
 * architecture.md §5.2 `lead_scores` — GLOBAL current score per
 * business: `id (uuid pk)` · `business_id (fk unique)` · `total (int
 * 0–100)` · `breakdown (jsonb — per-rule contribution + reason)` ·
 * `ruleset_version (int)` · `computed_at`.
 *
 * `businesses 1─1 lead_scores` (§5.3) — one current row per business,
 * upserted on `business_id`, matching `website_analyses`'s same
 * "one current row per business" shape now that both exist.
 * `breakdown` is `.$type()`-annotated against `ScoreBreakdownEntry[]`
 * (the engine's own output shape, `modules/intelligence/scoring/
 * engine.ts`) — added as part of the Sprint 3 finalization's Business
 * Detail Page, which reads a persisted score back and needs it typed,
 * not `unknown`; type-only import, no runtime dependency on the
 * scoring module from the schema layer.
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
    breakdown: jsonb("breakdown").notNull().$type<ScoreBreakdownEntry[]>(),
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
