import { NextResponse } from "next/server";

import { AI_RATE_LIMIT_MAX, AI_RATE_LIMIT_WINDOW_MS } from "@/config/constants";
import { jsonData, jsonError, requireSession } from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { aiAuditParamsSchema } from "@/lib/validation";
import {
  AiGenerationFailedError,
  AiKeyMissingError,
  getOrRunAiAudit,
} from "@/modules/ai";
import { BusinessNotFoundError } from "@/modules/intelligence";

const RATE_LIMIT_BUCKET = "ai.audit";

/**
 * `POST /api/businesses/{id}/ai/audit` (architecture.md §12.5, §11.2
 * AI Audit). No request body — everything the feature needs (business
 * facts, stored website analysis) is read server-side, scoped to the
 * signed-in user via `getOrRunAiAudit`. Explicitly user-triggered
 * (§11.3 "Cost transparency ... explicit triggering keep spend
 * minimal") — nothing calls this automatically.
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
  // (search, analyze, AI)" — checked before the orchestration call so a
  // cache hit and a fresh provider call count against the bucket alike,
  // matching /api/discovery/search's pattern.
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
    const data = await getOrRunAiAudit(userId, parsed.data.id);
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
    if (error instanceof AiGenerationFailedError) {
      return jsonError("AI_GENERATION_FAILED", error.message, requestId, 502, {
        headers: rateLimitHeaders,
      });
    }
    throw error;
  }
}
