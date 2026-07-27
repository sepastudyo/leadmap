import { NextResponse } from "next/server";

import { AI_RATE_LIMIT_MAX, AI_RATE_LIMIT_WINDOW_MS } from "@/config/constants";
import { jsonData, jsonError, requireSession } from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { aiAuditParamsSchema } from "@/lib/validation";
import {
  AiGenerationFailedError,
  AiKeyMissingError,
  LeadScoreUnavailableError,
  getOrRunOpportunityReasoning,
} from "@/modules/ai";
import { BusinessNotFoundError } from "@/modules/intelligence";

const RATE_LIMIT_BUCKET = "ai.opportunity";

/**
 * `POST /api/businesses/{id}/ai/opportunity` (architecture.md §12.5,
 * §11.2 Opportunity Reasoning). Mirrors
 * `app/api/businesses/[id]/ai/audit/route.ts` exactly — same envelope
 * helpers, same validation, same error mapping, same rate-limit
 * pattern (Sprint 6 Phase 6.1) — plus one addition:
 * `LEAD_SCORE_UNAVAILABLE` for the one extra prerequisite this feature
 * has that Audit doesn't (a published scoring ruleset).
 *
 * Reuses `aiAuditParamsSchema` for the path-param check rather than
 * declaring a second, identical `{ id: uuid() }` schema — the name is
 * a minor leftover from Audit shipping first; not renamed here since
 * doing so would mean touching Audit's route file, out of this
 * phase's scope.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { userId, requestId } = session;

  const parsed = aiAuditParamsSchema.safeParse(await params);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid business id.",
      requestId,
      422,
      { details: parsed.error.issues },
    );
  }

  // architecture.md §12.4 "Tighter buckets on expensive actions
  // (search, analyze, AI)" — same bucket shape as Audit's, kept
  // separate (`ai.opportunity` vs `ai.audit`) so running one feature
  // doesn't consume the other's allowance.
  const rateLimit = await checkRateLimit(userId, RATE_LIMIT_BUCKET, {
    limit: AI_RATE_LIMIT_MAX,
    windowMs: AI_RATE_LIMIT_WINDOW_MS,
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
      "Too many AI requests — try again shortly.",
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
    const data = await getOrRunOpportunityReasoning(userId, parsed.data.id);
    return jsonData(data, requestId, { headers: rateLimitHeaders });
  } catch (error) {
    if (error instanceof BusinessNotFoundError) {
      return jsonError("BUSINESS_NOT_FOUND", error.message, requestId, 404, {
        headers: rateLimitHeaders,
      });
    }
    if (error instanceof AiKeyMissingError) {
      return jsonError("AI_KEY_MISSING", error.message, requestId, 422, {
        headers: rateLimitHeaders,
      });
    }
    if (error instanceof LeadScoreUnavailableError) {
      return jsonError(
        "LEAD_SCORE_UNAVAILABLE",
        error.message,
        requestId,
        422,
        { headers: rateLimitHeaders },
      );
    }
    if (error instanceof AiGenerationFailedError) {
      return jsonError("AI_GENERATION_FAILED", error.message, requestId, 502, {
        headers: rateLimitHeaders,
      });
    }
    throw error;
  }
}
