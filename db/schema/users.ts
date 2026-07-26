import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { citext } from "./columns";

/**
 * architecture.md §5.2 `users`:
 * id (uuid pk) · email (citext unique) · name · password_hash (nullable,
 * for OAuth-only) · auth_provider · created_at · updated_at ·
 * deleted_at (nullable)
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: citext("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    authProvider: text("auth_provider").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // architecture.md §5.4 — soft-deletable tables get a partial index on
    // the hot lookup path (email, used at sign-in) to keep the active-row
    // set small.
    index("users_email_active_idx")
      .on(table.email)
      .where(sql`${table.deletedAt} is null`),
  ],
);
