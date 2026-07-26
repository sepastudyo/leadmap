import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { updateSettingsSchema } from "@/lib/validation";
import {
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

  const data = await getMaskedSettings(session.user.id);
  return NextResponse.json({ data, request_id: requestId });
}

export async function PATCH(request: Request) {
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
  const parsed = updateSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid settings input.",
          details: parsed.error.issues,
        },
        request_id: requestId,
      },
      { status: 422 },
    );
  }

  try {
    const data = await saveSettings(session.user.id, parsed.data, {
      ip: requestIp(request),
    });
    return NextResponse.json({ data, request_id: requestId });
  } catch (error) {
    if (
      error instanceof GoogleApiKeyRequiredError ||
      error instanceof AiApiKeyRequiredError
    ) {
      return NextResponse.json(
        {
          error: { code: "VALIDATION_ERROR", message: error.message },
          request_id: requestId,
        },
        { status: 422 },
      );
    }
    throw error;
  }
}
