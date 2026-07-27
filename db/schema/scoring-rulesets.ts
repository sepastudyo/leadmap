import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * architecture.md §5.2 `scoring_rulesets` — versioned collections for
 * reproducibility: `id (uuid pk)` · `version (int unique)` · `label` ·
 * `rule_keys (jsonb array)` · `is_active (bool)` · `published_at`.
 *
 * `scoring_rulesets *─* scoring_rules` (§5.3) is a **logical**
 * relationship via `rule_keys`, not a foreign key — architecture.md
 * documents it that way explicitly, so there's no FK constraint here
 * either. `rule_keys` order is meaningful: it's the display/evaluation
 * order the engine's `breakdown` follows.
 */
export const scoringRulesets = pgTable("scoring_rulesets", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: integer("version").notNull().unique(),
  label: text("label").notNull(),
  ruleKeys: jsonb("rule_keys").$type<string[]>().notNull(),
  isActive: boolean("is_active").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
