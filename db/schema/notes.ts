import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { businesses } from "./businesses";
import { users } from "./users";

/**
 * architecture.md §5.2 `notes` — USER plane:
 * id (uuid pk) · user_id (fk) · business_id (fk) · body (text) ·
 * pinned (bool) · created_at · updated_at · deleted_at (nullable)
 */
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    body: text("body").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // architecture.md §5.4 "Note timeline"; partial per §5.4's general
    // soft-delete rule, same pattern as `users_email_active_idx` —
    // pinned notes first, then newest first, is the order the timeline
    // is always read in (`listNotesByBusiness`), so the index matches
    // that shape directly.
    index("notes_user_business_pinned_created_at_idx")
      .on(table.userId, table.businessId, table.pinned, table.createdAt.desc())
      .where(sql`${table.deletedAt} is null`),
  ],
);
