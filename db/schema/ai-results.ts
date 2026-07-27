import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { businesses } from "./businesses";
import { aiProviderEnum } from "./user-settings";
import { users } from "./users";

/**
 * architecture.md §5.2 `ai_results` — USER plane (cached AI output; the
 * user paid for it with their key):
 * id (uuid pk) · user_id (fk) · business_id (fk) · type (enum:
 * audit|opportunity) · provider · prompt_version · input_hash ·
 * output (jsonb — structured, schema-validated) · created_at ·
 * unique (user_id, business_id, type, input_hash)
 *
 * `provider` reuses `aiProviderEnum` from `user-settings.ts` (Sprint 1)
 * rather than a second enum — it's the same fixed set (openai|gemini|
 * claude), just recording which one produced this specific result.
 *
 * `output` is left as plain `jsonb` (no `.$type<>()` annotation) —
 * unlike `lead_scores.breakdown`/`website_analyses`' typed columns,
 * the AI Audit and Opportunity Reasoning output shapes don't exist yet
 * (Sprint 5 Phase 5.1 is the provider-adapter/schema foundation only);
 * annotate this once the phase that defines those Zod schemas lands.
 */
export const aiResultTypeEnum = pgEnum("ai_result_type", [
  "audit",
  "opportunity",
]);

export const aiResults = pgTable(
  "ai_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    type: aiResultTypeEnum("type").notNull(),
    provider: aiProviderEnum("provider").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputHash: text("input_hash").notNull(),
    output: jsonb("output").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // architecture.md §5.4 "AI cache hits"
    unique("ai_results_user_business_type_input_hash_key").on(
      table.userId,
      table.businessId,
      table.type,
      table.inputHash,
    ),
  ],
);
