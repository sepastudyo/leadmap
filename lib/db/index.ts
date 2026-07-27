import "server-only";
import { isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PgColumn } from "drizzle-orm/pg-core";
import postgres from "postgres";

import { env } from "@/config/env";
import * as schema from "@/db/schema";

/**
 * `prepare: false` disables postgres.js prepared statements, which are
 * incompatible with transaction-mode connection poolers (Neon/Supabase
 * pgbouncer) — the pooler is mandatory for serverless connection
 * fan-out (architecture.md §15).
 */
const client = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });

/**
 * Repository functions accept this instead of hardcoding `db` so a
 * caller can pass a `tx` from `db.transaction(...)` and have the work
 * actually happen inside that transaction (needed for
 * `modules/discovery/lock.ts`'s advisory-lock idempotency guard —
 * `pg_advisory_xact_lock` only serializes work done on the same
 * transaction that holds it).
 */
export type DbClient =
  typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Central `deleted_at IS NULL` predicate (architecture.md §5.5
 * "filtered centrally in lib/db") — every soft-delete-aware query
 * composes this into its `where` (via `and(...)`) instead of writing
 * `isNull(table.deletedAt)` inline at each call site. Health review
 * finding #10.
 */
export function notDeleted(deletedAtColumn: PgColumn) {
  return isNull(deletedAtColumn);
}
