import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { auth } from "@/auth";

/**
 * Shared Route Handler helpers (architecture.md §12.2 response
 * envelope, §12.4 auth resolution). Health review finding #6: the
 * `auth()` + 401 check and the envelope construction were hand-rolled
 * identically in every Route Handler (`discovery/search`, `settings`,
 * `discovery/maps-key`); centralized here before Sprint 4 added a
 * 4th–7th copy for favorites/notes.
 */

export function jsonError(
  code: string,
  message: string,
  requestId: string,
  status: number,
  extra?: { details?: unknown; headers?: HeadersInit },
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(extra?.details !== undefined ? { details: extra.details } : {}),
      },
      request_id: requestId,
    },
    { status, headers: extra?.headers },
  );
}

export function jsonData(
  data: unknown,
  requestId: string,
  init?: {
    status?: number;
    meta?: Record<string, unknown>;
    headers?: HeadersInit;
  },
) {
  return NextResponse.json(
    {
      data,
      ...(init?.meta ? { meta: init.meta } : {}),
      request_id: requestId,
    },
    { status: init?.status ?? 200, headers: init?.headers },
  );
}

/**
 * Resolves the signed-in user, or a ready-to-return 401 envelope.
 * Usage:
 *   const session = await requireSession();
 *   if (session instanceof NextResponse) return session;
 *   const { userId, requestId } = session;
 */
export async function requireSession(): Promise<
  { userId: string; requestId: string } | NextResponse
> {
  const requestId = randomUUID();
  const session = await auth();

  if (!session?.user?.id) {
    return jsonError("UNAUTHORIZED", "Sign in required.", requestId, 401);
  }

  return { userId: session.user.id, requestId };
}
