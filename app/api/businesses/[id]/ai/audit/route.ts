import { NextResponse } from "next/server";

import { jsonData, jsonError, requireSession } from "@/lib/http";
import { aiAuditParamsSchema } from "@/lib/validation";
import {
  AiGenerationFailedError,
  AiKeyMissingError,
  getOrRunAiAudit,
} from "@/modules/ai";
import { BusinessNotFoundError } from "@/modules/intelligence";

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

  try {
    const data = await getOrRunAiAudit(userId, parsed.data.id);
    return jsonData(data, requestId);
  } catch (error) {
    if (error instanceof BusinessNotFoundError) {
      return jsonError("BUSINESS_NOT_FOUND", error.message, requestId, 404);
    }
    if (error instanceof AiKeyMissingError) {
      return jsonError("AI_KEY_MISSING", error.message, requestId, 422);
    }
    if (error instanceof AiGenerationFailedError) {
      return jsonError("AI_GENERATION_FAILED", error.message, requestId, 502);
    }
    throw error;
  }
}
