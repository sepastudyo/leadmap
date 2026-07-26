import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";

import { idempotencyKeys } from "@/db/schema";
import { db } from "@/lib/db";

/**
 * `Idempotency-Key` mechanism, implemented exactly as architecture.md
 * §12.4 specifies it: a client-supplied key whose first *successful*
 * response is stored and replayed verbatim on retry, so a paid action
 * (search today; analyze/AI later) is never executed twice for the
 * same attempt. See `db/schema/idempotency-keys.ts` for why this
 * needed its own table.
 *
 * This is a request-attempt guard, independent of
 * `modules/discovery/lock.ts`'s advisory lock (a content-concurrency
 * guard scoped to the search signature) — the two compose rather than
 * overlap: this stops *one client's own retry* of *one call* from
 * re-executing; the lock stops *any* concurrent callers (same client or
 * not, with or without a key) from double-spending on the *same
 * search content*. Neither replaces the other.
 */

export type StoredResponse = { status: number; body: unknown };

export function hashRequestBody(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export type IdempotencyLookupResult =
  | { outcome: "miss" }
  | { outcome: "hit"; response: StoredResponse }
  | { outcome: "conflict" };

/**
 * `outcome: "conflict"` means the same `(user, bucket, key)` was
 * already used for a *different* request body — the client reused a
 * key incorrectly, so the caller should reject with 409 rather than
 * replay a mismatched response.
 */
export async function lookupIdempotencyKey(
  userId: string,
  bucket: string,
  key: string,
  requestHash: string,
): Promise<IdempotencyLookupResult> {
  const [row] = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.bucket, bucket),
        eq(idempotencyKeys.key, key),
      ),
    )
    .limit(1);

  if (!row || row.expiresAt.getTime() <= Date.now()) return { outcome: "miss" };
  if (row.requestHash !== requestHash) return { outcome: "conflict" };

  return {
    outcome: "hit",
    response: { status: row.responseStatus, body: row.responseBody },
  };
}

/**
 * Records a successful response under `(user, bucket, key)`. Only ever
 * called after a real success — architecture.md §12.4 says "the first
 * *result*", and the product instruction that prompted this
 * implementation was explicit: store the first *successful* response
 * only, so a failed attempt (validation error, missing Google key,
 * upstream failure, rate limit) stays freely retryable under the same
 * key rather than being permanently replayed as a cached failure.
 *
 * Upserts unconditionally on conflict: the only way this table already
 * has a live row for this key at call time is a race between two
 * concurrent first-time requests (both saw "miss"), and both computed
 * equally-valid responses — last-write-wins is fine.
 */
export async function storeIdempotentResponse(
  userId: string,
  bucket: string,
  key: string,
  requestHash: string,
  response: StoredResponse,
  ttlHours: number,
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  await db
    .insert(idempotencyKeys)
    .values({
      userId,
      bucket,
      key,
      requestHash,
      responseStatus: response.status,
      responseBody: response.body as object,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [
        idempotencyKeys.userId,
        idempotencyKeys.bucket,
        idempotencyKeys.key,
      ],
      set: {
        requestHash,
        responseStatus: response.status,
        responseBody: response.body as object,
        createdAt: now,
        expiresAt,
      },
    });
}

/**
 * Small, bounded opportunistic purge — same pattern as
 * `modules/discovery/search-cache-repository.ts`'s
 * `purgeExpiredSearchCache` (architecture.md §6.4: no cron, cleaned
 * opportunistically during reads).
 */
export async function purgeExpiredIdempotencyKeys(limit = 20): Promise<number> {
  const stale = await db
    .select({ id: idempotencyKeys.id })
    .from(idempotencyKeys)
    .where(lt(idempotencyKeys.expiresAt, new Date()))
    .limit(limit);

  if (stale.length === 0) return 0;

  await db.delete(idempotencyKeys).where(
    inArray(
      idempotencyKeys.id,
      stale.map((row) => row.id),
    ),
  );

  return stale.length;
}
