import { jsonb, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { bytea } from "./columns";
import { users } from "./users";

/**
 * architecture.md §5.2 `user_settings` — one row per user:
 * user_id (fk pk) · google_api_key_enc (bytea, encrypted) ·
 * ai_provider (enum: openai|gemini|claude|null) ·
 * ai_api_key_enc (bytea, encrypted, nullable) · preferences (jsonb) ·
 * updated_at
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
  googleApiKeyEnc: bytea("google_api_key_enc").notNull(),
  aiProvider: aiProviderEnum("ai_provider"),
  aiApiKeyEnc: bytea("ai_api_key_enc"),
  preferences: jsonb("preferences").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
