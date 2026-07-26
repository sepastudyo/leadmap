import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users";

/**
 * architecture.md §12.4 "Idempotency: Idempotency-Key on paid actions
 * (search/analyze/AI) so client retries don't double-spend the user's
 * Google/AI quota; the first result is stored briefly and replayed on
 * retry." Not originally in §5.2's entity dictionary — added here
 * because implementing §12.4 as literally specified (a client-supplied
 * key whose *response* is stored and replayed) has no other durable
 * home: Vercel functions are stateless per invocation, so this can't be
 * in-memory, and no existing table is shaped for a keyed response
 * payload with its own short expiry.
 *
 * `(user_id, bucket, key)` is unique — `bucket` scopes a key to one
 * action ("discovery.search" today; "business.analyze" / "ai.audit"
 * etc. once §12.4's other paid actions exist), the same role `bucket`
 * plays in `rate_limits`. `request_hash` guards against a client
 * reusing a key for a *different* request — a mismatch is a 409, not a
 * replay.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    bucket: text("bucket").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("idempotency_keys_user_bucket_key_key").on(
      table.userId,
      table.bucket,
      table.key,
    ),
    // Same opportunistic-purge-on-read pattern as `search_cache`
    // (architecture.md §6.4) — no cron.
    index("idempotency_keys_expires_at_idx").on(table.expiresAt),
  ],
);
