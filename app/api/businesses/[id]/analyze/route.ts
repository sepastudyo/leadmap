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
  refreshWebsiteAnalysis,
} from "@/modules/intelligence";

const RATE_LIMIT_BUCKET = "business.analyze.refresh";

/**
 * `POST /api/businesses/{id}/analyze` (architecture.md §12.5 "Run
 * website analysis (in-request)", §6.4 "Manual: ... re-run analysis ...
 * an explicit, user-triggered invalidation that respects rate limits").
 * Sprint 7 Phase 7.6. Mirrors `/api/businesses/{id}/details` exactly —
 * same validation, same rate-limit bucket shape (a separate bucket, so
 * exhausting one force-refresh action doesn't block the other, the same
 * `ai.audit`/`ai.opportunity` precedent from Sprint 6 Phase 6.1) — using
 * `refreshWebsiteAnalysis` (`modules/intelligence/website-analysis.ts`)
 * rather than calling `getOrRunWebsiteAnalysis` directly, since that
 * function needs the business's current `websiteUrl` in hand, which
 * this route doesn't otherwise have reason to fetch itself.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { requestId } = session;

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

  const rateLimit = await checkRateLimit(session.userId, RATE_LIMIT_BUCKET, {
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
    const data = await refreshWebsiteAnalysis(parsedParams.data.id);
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
