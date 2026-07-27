import { NextResponse } from "next/server";

import {
  IDEMPOTENCY_KEY_TTL_HOURS,
  SEARCH_RATE_LIMIT_MAX,
  SEARCH_RATE_LIMIT_WINDOW_MS,
} from "@/config/constants";
import { jsonData, jsonError, requireSession } from "@/lib/http";
import {
  hashRequestBody,
  lookupIdempotencyKey,
  storeIdempotentResponse,
} from "@/lib/idempotency";
import { checkRateLimit } from "@/lib/rate-limit";
import { idempotencyKeySchema, searchRequestSchema } from "@/lib/validation";
import { searchBusinesses } from "@/modules/discovery";
import { GeoApiError } from "@/modules/geo";

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
 * a repeat with the same key, so the search provider is never called
 * twice for the same attempt. This composes with, rather than replaces,
 * `modules/discovery/lock.ts`'s Postgres advisory lock: the lock is a
 * content-concurrency guard (stops *any* concurrent caller from
 * double-spending on the *same search content*, key or no key); this
 * is a request-attempt guard (stops *this client's own retry* of *this
 * specific call*). See docs/sprint-2.md for the fuller writeup.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { userId, requestId } = session;

  const body = await request.json().catch(() => null);
  const parsed = searchRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid search input.",
      requestId,
      422,
      {
        details: parsed.error.issues,
      },
    );
  }

  // Idempotency-Key is optional — callers that don't send one just get
  // no replay protection, same as before this was implemented.
  const idempotencyKeyHeader = request.headers.get("Idempotency-Key");
  let idempotencyKey: string | null = null;

  if (idempotencyKeyHeader !== null) {
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKeyHeader);
    if (!parsedKey.success) {
      return jsonError(
        "VALIDATION_ERROR",
        "Invalid Idempotency-Key header.",
        requestId,
        422,
      );
    }
    idempotencyKey = parsedKey.data;
  }

  const requestHash = hashRequestBody(parsed.data);

  if (idempotencyKey) {
    const lookup = await lookupIdempotencyKey(
      userId,
      IDEMPOTENCY_BUCKET,
      idempotencyKey,
      requestHash,
    );

    if (lookup.outcome === "hit") {
      // §12.4 "the first result is ... replayed on retry" — the stored
      // body is a *complete*, previously-built envelope replayed
      // verbatim, not a fresh one, so this bypasses `jsonData`/
      // `jsonError` deliberately rather than re-wrapping it.
      return NextResponse.json(lookup.response.body, {
        status: lookup.response.status,
        headers: { "Idempotency-Replayed": "true" },
      });
    }

    if (lookup.outcome === "conflict") {
      return jsonError(
        "IDEMPOTENCY_KEY_CONFLICT",
        "This Idempotency-Key was already used with a different request.",
        requestId,
        409,
      );
    }
  }

  // architecture.md §12.4 "Tighter buckets on expensive actions
  // (search, analyze, AI)" — only charged for genuinely new work; an
  // idempotent replay above never reaches here.
  const rateLimit = await checkRateLimit(userId, IDEMPOTENCY_BUCKET, {
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

    return jsonError(
      "RATE_LIMITED",
      "Too many searches — try again shortly.",
      requestId,
      429,
      {
        headers: {
          ...rateLimitHeaders,
          "Retry-After": String(retryAfterSeconds),
        },
      },
    );
  }

  const { cursor, pageSize, ...input } = parsed.data;

  try {
    const result = await searchBusinesses(userId, input, {
      cursor,
      pageSize,
    });

    const meta = {
      next_cursor: result.nextCursor,
      from_cache: result.fromCache,
      total_cached: result.totalCached,
    };

    if (idempotencyKey) {
      // Only successful responses are memoized — a failed attempt
      // (below) must stay freely retryable under the same key. Stored
      // verbatim as the envelope shape `jsonData` would itself produce,
      // so a later replay above can return it unchanged.
      await storeIdempotentResponse(
        userId,
        IDEMPOTENCY_BUCKET,
        idempotencyKey,
        requestHash,
        {
          status: 200,
          body: { data: result.businesses, meta, request_id: requestId },
        },
        IDEMPOTENCY_KEY_TTL_HOURS,
      );
    }

    return jsonData(result.businesses, requestId, {
      meta,
      headers: rateLimitHeaders,
    });
  } catch (error) {
    if (error instanceof GeoApiError) {
      return jsonError(
        "GEO_API_ERROR",
        "The search provider returned an error. Try again shortly.",
        requestId,
        502,
        { headers: rateLimitHeaders },
      );
    }

    throw error;
  }
}
