import { jsonb, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { bytea } from "./columns";
import { users } from "./users";

/**
 * architecture.md §5.2 `user_settings` — one row per user:
 * user_id (fk pk) · ai_provider (enum: openai|gemini|claude|null) ·
 * ai_api_key_enc (bytea, encrypted, nullable) · preferences (jsonb) ·
 * updated_at
 *
 * `google_api_key_enc` (originally required, one per §5.2's Sprint-1
 * dictionary) was dropped when Business Discovery migrated off Google
 * Maps Platform onto free, keyless OpenStreetMap-backed services
 * (`modules/geo`) — no provider API key is stored or needed anymore.
 * AI keys are unaffected: those remain BYOK per architecture.md §11.1,
 * a separate, still-optional concern.
 */
export const aiProviderEnum = pgEnum("ai_provider", [
  "openai",
  "gemini",
  "claude",
]);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id),
  aiProvider: aiProviderEnum("ai_provider"),
  aiApiKeyEnc: bytea("ai_api_key_enc"),
  preferences: jsonb("preferences").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
