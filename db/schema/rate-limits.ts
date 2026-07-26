import {
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * architecture.md §5.2 `rate_limits` — Postgres-backed limiter state:
 * id (uuid pk) · subject (text — user id or ip) · bucket
 * (text — route/action) · window_start (timestamptz) · count (int) ·
 * unique (subject, bucket, window_start)
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subject: text("subject").notNull(),
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
  },
  (table) => [
    unique("rate_limits_subject_bucket_window_start_key").on(
      table.subject,
      table.bucket,
      table.windowStart,
    ),
  ],
);
