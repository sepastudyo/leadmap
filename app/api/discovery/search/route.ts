import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  IDEMPOTENCY_KEY_TTL_HOURS,
  SEARCH_RATE_LIMIT_MAX,
  SEARCH_RATE_LIMIT_WINDOW_MS,
} from "@/config/constants";
import {
  hashRequestBody,
  lookupIdempotencyKey,
  storeIdempotentResponse,
} from "@/lib/idempotency";
import { checkRateLimit } from "@/lib/rate-limit";
import { idempotencyKeySchema, searchRequestSchema } from "@/lib/validation";
import {
  GoogleApiKeyMissingError,
  searchBusinesses,
} from "@/modules/discovery";
import { GoogleApiError } from "@/modules/google";

const IDEMPOTENCY_BUCKET = "discovery.search";

/**
 * `POST /api/discovery/search` (architecture.md §12.5). Staged search,
 * cache-first (architecture.md §6.2). Table View / Map View / result
 * filtering / sorting are a later Sprint 2 phase — this only returns
 * the raw business set + pagination metadata.
 *
 * Idempotency (architecture.md §12.4): implemented as specified — a
 * client-supplied `Idempotency-Key` header, the first *successful*
 * response stored briefly (`lib/idempotency`) and replayed verbatim on
 * a repeat with the same key, so Google is never called twice for the
 * same attempt. This composes with, rather than replaces,
 * `modules/discovery/lock.ts`'s Postgres advisory lock: the lock is a
 * content-concurrency guard (stops *any* concurrent caller from
 * double-spending on the *same search content*, key or no key); this
 * is a request-attempt guard (stops *this client's own retry* of *this
 * specific call*). See docs/sprint-2.md for the fuller writeup.
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
      { status: 422 },
    );
  }

  // Idempotency-Key is optional — callers that don't send one just get
  // no replay protection, same as before this was implemented.
  const idempotencyKeyHeader = request.headers.get("Idempotency-Key");
  let idempotencyKey: string | null = null;

  if (idempotencyKeyHeader !== null) {
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKeyHeader);
    if (!parsedKey.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid Idempotency-Key header.",
          },
          request_id: requestId,
        },
        { status: 422 },
      );
    }
    idempotencyKey = parsedKey.data;
  }

  const requestHash = hashRequestBody(parsed.data);

  if (idempotencyKey) {
    const lookup = await lookupIdempotencyKey(
      session.user.id,
      IDEMPOTENCY_BUCKET,
      idempotencyKey,
      requestHash,
    );

    if (lookup.outcome === "hit") {
      // §12.4 "the first result is ... replayed on retry" — no rate
      // limit charge, no Google/DB work: this is not a new action.
      return NextResponse.json(lookup.response.body, {
        status: lookup.response.status,
        headers: { "Idempotency-Replayed": "true" },
      });
    }

    if (lookup.outcome === "conflict") {
      return NextResponse.json(
        {
          error: {
            code: "IDEMPOTENCY_KEY_CONFLICT",
            message:
              "This Idempotency-Key was already used with a different request.",
          },
          request_id: requestId,
        },
        { status: 409 },
      );
    }
  }

  // architecture.md §12.4 "Tighter buckets on expensive actions
  // (search, analyze, AI)" — only charged for genuinely new work; an
  // idempotent replay above never reaches here.
  const rateLimit = await checkRateLimit(session.user.id, IDEMPOTENCY_BUCKET, {
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

  const { cursor, pageSize, ...input } = parsed.data;

  try {
    const result = await searchBusinesses(session.user.id, input, {
      cursor,
      pageSize,
    });

    const responseBody = {
      data: result.businesses,
      meta: {
        next_cursor: result.nextCursor,
        from_cache: result.fromCache,
        total_cached: result.totalCached,
      },
      request_id: requestId,
    };

    if (idempotencyKey) {
      // Only successful responses are memoized — a failed attempt
      // (below) must stay freely retryable under the same key.
      await storeIdempotentResponse(
        session.user.id,
        IDEMPOTENCY_BUCKET,
        idempotencyKey,
        requestHash,
        { status: 200, body: responseBody },
        IDEMPOTENCY_KEY_TTL_HOURS,
      );
    }

    return NextResponse.json(responseBody, { headers: rateLimitHeaders });
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
