import { NextResponse } from "next/server";

import { jsonData, jsonError, requireSession } from "@/lib/http";
import { aiAuditParamsSchema } from "@/lib/validation";
import {
  AiGenerationFailedError,
  AiKeyMissingError,
  LeadScoreUnavailableError,
  getOrRunOpportunityReasoning,
} from "@/modules/ai";
import { BusinessNotFoundError } from "@/modules/intelligence";

/**
 * `POST /api/businesses/{id}/ai/opportunity` (architecture.md §12.5,
 * §11.2 Opportunity Reasoning). Mirrors
 * `app/api/businesses/[id]/ai/audit/route.ts` exactly — same envelope
 * helpers, same validation, same error mapping — plus one addition:
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

  try {
    const data = await getOrRunOpportunityReasoning(userId, parsed.data.id);
    return jsonData(data, requestId);
  } catch (error) {
    if (error instanceof BusinessNotFoundError) {
      return jsonError("BUSINESS_NOT_FOUND", error.message, requestId, 404);
    }
    if (error instanceof AiKeyMissingError) {
      return jsonError("AI_KEY_MISSING", error.message, requestId, 422);
    }
    if (error instanceof LeadScoreUnavailableError) {
      return jsonError("LEAD_SCORE_UNAVAILABLE", error.message, requestId, 422);
    }
    if (error instanceof AiGenerationFailedError) {
      return jsonError("AI_GENERATION_FAILED", error.message, requestId, 502);
    }
    throw error;
  }
}
