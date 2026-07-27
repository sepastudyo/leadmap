import { NextResponse } from "next/server";

import { jsonData, jsonError, requireSession } from "@/lib/http";
import { updateSettingsSchema } from "@/lib/validation";
import {
  AiApiKeyInvalidError,
  AiApiKeyRequiredError,
  GoogleApiKeyRequiredError,
  getMaskedSettings,
  saveSettings,
} from "@/modules/settings";

/**
 * `GET/PATCH /api/settings` (architecture.md §12.5) — read/update the
 * signed-in user's Google/AI keys + provider. Response envelope per
 * architecture.md §12.2. Keys are never returned in the response body;
 * only a masked presence/provider summary is (architecture.md §13.4).
 */

function requestIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { userId, requestId } = session;

  const data = await getMaskedSettings(userId);
  return jsonData(data, requestId);
}

export async function PATCH(request: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { userId, requestId } = session;

  const body = await request.json().catch(() => null);
  const parsed = updateSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid settings input.",
      requestId,
      422,
      { details: parsed.error.issues },
    );
  }

  try {
    const data = await saveSettings(userId, parsed.data, {
      ip: requestIp(request),
    });
    return jsonData(data, requestId);
  } catch (error) {
    if (
      error instanceof GoogleApiKeyRequiredError ||
      error instanceof AiApiKeyRequiredError ||
      error instanceof AiApiKeyInvalidError
    ) {
      return jsonError("VALIDATION_ERROR", error.message, requestId, 422);
    }
    throw error;
  }
}
