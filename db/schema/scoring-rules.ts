import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * architecture.md §5.2 `scoring_rules` — configurable rules (§10):
 * `id (uuid pk)` · `key (text unique)` · `name` · `description` ·
 * `category` · `expression (jsonb — condition DSL)` · `weight
 * (numeric)` · `max_points (int)` · `enabled (bool)` · `version (int)`
 * · `created_at` · `updated_at`.
 *
 * Didn't exist before Sprint 3 Phase 3.5 — the Lead Score engine is
 * this table's first consumer. `expression` is stored as opaque
 * jsonb; Postgres has no way to constrain "is a well-formed
 * ScoringExpression" at the column level, so that shape is enforced by
 * `lib/validation/scoring.ts`'s Zod schema wherever a row is read back
 * for evaluation, not by the DB.
 */
export const scoringRules = pgTable("scoring_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  expression: jsonb("expression").notNull(),
  weight: numeric("weight", { mode: "number" }).notNull(),
  maxPoints: integer("max_points").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
