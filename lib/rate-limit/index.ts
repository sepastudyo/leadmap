import "server-only";
import { sql } from "drizzle-orm";

import { rateLimits } from "@/db/schema";
import { db } from "@/lib/db";

/**
 * Postgres-backed fixed-window rate limiter — no Redis (architecture.md
 * §12.4, §5.2 `rate_limits`). `subject+bucket+window_start` is unique,
 * so the increment is a single atomic `INSERT ... ON CONFLICT DO UPDATE
 * ... RETURNING`, race-safe under concurrent requests without a
 * separate lock.
 */

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** When the current window ends and the count resets. */
  resetAt: Date;
};

export type RateLimitOptions = {
  /** Max requests allowed per window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
};

/**
 * `subject` is a user id or IP (architecture.md §5.2); `bucket` is the
 * route/action being limited (architecture.md §12.4 "Tighter buckets on
 * expensive actions (search, analyze, AI)") — e.g. `"discovery.search"`.
 */
export async function checkRateLimit(
  subject: string,
  bucket: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const { limit, windowMs } = options;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const [row] = await db
    .insert(rateLimits)
    .values({ subject, bucket, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.subject, rateLimits.bucket, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  const count = row?.count ?? 1;

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt: new Date(windowStart.getTime() + windowMs),
  };
}
