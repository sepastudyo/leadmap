import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  SEARCH_RATE_LIMIT_MAX,
  SEARCH_RATE_LIMIT_WINDOW_MS,
} from "@/config/constants";
import { checkRateLimit } from "@/lib/rate-limit";
import { searchRequestSchema } from "@/lib/validation";
import {
  GoogleApiKeyMissingError,
  searchBusinesses,
} from "@/modules/discovery";
import { GoogleApiError } from "@/modules/google";

/**
 * `POST /api/discovery/search` (architecture.md §12.5). Staged search,
 * cache-first (architecture.md §6.2). Table View / Map View / result
 * filtering / sorting are a later Sprint 2 phase — this only returns
 * the raw business set + pagination metadata.
 *
 * Idempotency (architecture.md §12.4 "client retries don't double-spend
 * the user's Google/AI quota"): this endpoint doesn't read a client
 * `Idempotency-Key` header, because it doesn't need one. The search
 * signature (`modules/discovery/signature.ts`) already is a
 * deterministic idempotency key — identical input always hashes to the
 * same value — and `modules/discovery/lock.ts`'s Postgres advisory
 * lock guarantees Google is called at most once per signature even
 * under concurrent retries. A client-supplied key would be a weaker,
 * redundant mechanism on top of that, with no table in architecture.md
 * §5.2 to durably store it in.
 */
export async function POST(request: Request) {
  const requestId = randomUUID();
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        error: { code: "UNAUTHORIZED", message: "Sign in required." },
        request_id: requestId,
      },
      { status: 401 },
    );
  }

  // architecture.md §12.4 "Tighter buckets on expensive actions
  // (search, analyze, AI)" — checked before touching the DB/Google for
  // the actual search, so an exhausted limit is cheap to reject.
  const rateLimit = await checkRateLimit(session.user.id, "discovery.search", {
    limit: SEARCH_RATE_LIMIT_MAX,
    windowMs: SEARCH_RATE_LIMIT_WINDOW_MS,
  });

  const rateLimitHeaders = {
    "X-RateLimit-Limit": String(rateLimit.limit),
    "X-RateLimit-Remaining": String(rateLimit.remaining),
    "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
  };

  if (!rateLimit.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000),
    );

    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many searches — try again shortly.",
        },
        request_id: requestId,
      },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders,
          "Retry-After": String(retryAfterSeconds),
        },
      },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = searchRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid search input.",
          details: parsed.error.issues,
        },
        request_id: requestId,
      },
      { status: 422, headers: rateLimitHeaders },
    );
  }

  const { cursor, pageSize, ...input } = parsed.data;

  try {
    const result = await searchBusinesses(session.user.id, input, {
      cursor,
      pageSize,
    });

    return NextResponse.json(
      {
        data: result.businesses,
        meta: {
          next_cursor: result.nextCursor,
          from_cache: result.fromCache,
          total_cached: result.totalCached,
        },
        request_id: requestId,
      },
      { headers: rateLimitHeaders },
    );
  } catch (error) {
    if (error instanceof GoogleApiKeyMissingError) {
      return NextResponse.json(
        {
          error: { code: "GOOGLE_API_KEY_MISSING", message: error.message },
          request_id: requestId,
        },
        { status: 422, headers: rateLimitHeaders },
      );
    }

    if (error instanceof GoogleApiError) {
      return NextResponse.json(
        {
          error: {
            code: "GOOGLE_API_ERROR",
            message:
              "The search provider returned an error. Try again shortly.",
          },
          request_id: requestId,
        },
        { status: 502, headers: rateLimitHeaders },
      );
    }

    throw error;
  }
}
