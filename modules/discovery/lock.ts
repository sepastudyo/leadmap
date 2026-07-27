import "server-only";
import { sql } from "drizzle-orm";

import { db, type DbClient } from "@/lib/db";

/**
 * Idempotency/concurrency guard for a search signature (architecture.md
 * §12.4 "Idempotency-Key on paid actions ... so client retries don't
 * double-spend the user's AI quota"). architecture.md §5.2
 * defines no idempotency-key table, so this doesn't add one — instead
 * it leans on two things that are already architecture-native:
 *
 * 1. The search signature (architecture.md §6.3) is itself a strong,
 *    deterministic idempotency key: two requests for the identical
 *    normalized search always hash to the same value, no client-
 *    supplied token required.
 * 2. A Postgres transaction-scoped advisory lock
 *    (`pg_advisory_xact_lock`) keyed on that signature serializes
 *    concurrent cache-miss requests for the *same* search, so only one
 *    of them actually calls the search provider — the same "no Redis,
 *    Postgres does it" posture architecture.md already uses for rate
 *    limiting (§12.4).
 *
 * `hashtextextended` (built-in since PG 11) turns the signature into
 * the bigint `pg_advisory_xact_lock` takes; the lock is released
 * automatically when the transaction ends, so a crash mid-request can
 * never leave it stuck.
 */
export async function withSearchSignatureLock<T>(
  signature: string,
  fn: (tx: DbClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${signature}, 0))`,
    );
    return fn(tx);
  });
}
