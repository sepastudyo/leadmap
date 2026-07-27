import { NextResponse } from "next/server";

import {
  BUSINESS_REFRESH_RATE_LIMIT_MAX,
  BUSINESS_REFRESH_RATE_LIMIT_WINDOW_MS,
} from "@/config/constants";
import { jsonData, jsonError, requireSession } from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { idParamSchema } from "@/lib/validation";
import {
  BusinessNotFoundError,
  getOrRefreshPlaceDetails,
} from "@/modules/intelligence";

const RATE_LIMIT_BUCKET = "business.details.refresh";

/**
 * `POST /api/businesses/{id}/details` (architecture.md §12.5 "Force-
 * refresh Place Details (rate-limited)", §6.4 "Manual: a user can
 * force-refresh a business ... an explicit, user-triggered invalidation
 * that respects rate limits"). Sprint 7 Phase 7.6. No request body —
 * everything needed is the path id plus the signed-in session, the same
 * shape `/api/businesses/{id}/ai/audit` already uses.
 *
 * `force: true` is this route's entire reason to exist: it's the only
 * caller in the app that bypasses `getOrRefreshPlaceDetails`'s normal
 * §6.2 staleness check. Every other read of Place Details (the Business
 * Detail Page RSC) is unaffected — it calls the same function with no
 * `options`, unchanged.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { userId, requestId } = session;

  const parsedParams = idParamSchema.safeParse(await params);
  if (!parsedParams.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid business id.",
      requestId,
      422,
      { details: parsedParams.error.issues },
    );
  }

  // architecture.md §6.4 "respects rate limits" — a force-refresh always
  // calls the (free, but shared and rate-policy-bound) search provider
  // rather than serving from cache, so this is checked before the call,
  // the same pattern Sprint 6 Phase 6.1 established for the AI routes.
  const rateLimit = await checkRateLimit(userId, RATE_LIMIT_BUCKET, {
    limit: BUSINESS_REFRESH_RATE_LIMIT_MAX,
    windowMs: BUSINESS_REFRESH_RATE_LIMIT_WINDOW_MS,
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
      "Too many refresh requests — try again shortly.",
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

  try {
    const data = await getOrRefreshPlaceDetails(parsedParams.data.id, {
      force: true,
    });
    return jsonData(data, requestId, { headers: rateLimitHeaders });
  } catch (error) {
    if (error instanceof BusinessNotFoundError) {
      return jsonError("BUSINESS_NOT_FOUND", error.message, requestId, 404, {
        headers: rateLimitHeaders,
      });
    }
    throw error;
  }
}
