import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * architecture.md §5.2 `audit_logs` — lightweight security trail (auth
 * events, key changes, rule edits):
 * id (uuid pk) · user_id (nullable) · action · entity_type ·
 * entity_id (nullable) · metadata (jsonb) · ip · occurred_at
 *
 * `user_id` is intentionally NOT a foreign key: unlike every other
 * `user_id` column in the schema (all marked `(fk)` in §5.2), this one
 * carries no `(fk)` tag and audit_logs is absent from the §5.3
 * relationship list. An audit trail must survive user deletion and may
 * also record system-level actions with no associated user.
 */
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata").notNull().default({}),
  ip: text("ip").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
