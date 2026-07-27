import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { businesses } from "./businesses";
import { users } from "./users";

/**
 * architecture.md §5.2 `favorites` — USER plane (a user's saved lead):
 * id (uuid pk) · user_id (fk) · business_id (fk) · status (enum:
 * new|reviewing|qualified|not_fit|won) · priority (nullable int) ·
 * follow_up_at (date, nullable) · custom_fields (jsonb) · created_at ·
 * updated_at · deleted_at (nullable) · unique (user_id, business_id)
 *
 * The `unique (user_id, business_id)` pair from §5.2 is implemented as
 * a *partial* unique index — `WHERE deleted_at IS NULL` — rather than a
 * plain table constraint. A flat constraint would make "unsave" (this
 * sprint's soft-delete deliverable) permanent: re-favoriting the same
 * business later would collide with the old, soft-deleted row.
 * Scoping uniqueness to active rows is what makes save → unsave →
 * re-save actually work, and follows §5.4's own general rule for
 * soft-deletable tables ("partial indexes WHERE deleted_at IS NULL").
 * A re-save after an unsave inserts a fresh row (default status/
 * priority/follow-up) rather than reviving the old one — the
 * soft-deleted row is history, not a draft to resume.
 */
export const favoriteStatusEnum = pgEnum("favorite_status", [
  "new",
  "reviewing",
  "qualified",
  "not_fit",
  "won",
]);

export const favorites = pgTable(
  "favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    status: favoriteStatusEnum("status").notNull().default("new"),
    priority: integer("priority"),
    followUpAt: date("follow_up_at"),
    customFields: jsonb("custom_fields")
      .notNull()
      .default({})
      .$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("favorites_user_business_active_idx")
      .on(table.userId, table.businessId)
      .where(sql`${table.deletedAt} is null`),
    // architecture.md §5.4 "Lead lists + dashboard follow-ups"; partial
    // per §5.4's general soft-delete rule, same pattern as
    // `users_email_active_idx`.
    index("favorites_user_status_idx")
      .on(table.userId, table.status)
      .where(sql`${table.deletedAt} is null`),
    index("favorites_user_follow_up_at_idx")
      .on(table.userId, table.followUpAt)
      .where(sql`${table.deletedAt} is null`),
  ],
);
